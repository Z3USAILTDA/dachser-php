/**
 * server/routes/sea.js
 * Rotas do módulo SEA: /api/sea/*, /api/sea/maritimo/*
 * Pool: MARIADB_SEA_* — databases: dados_dachser, ai_agente
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';

// ─── Constantes ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const SEA_SHIPPING_LINES = [
  { code: 'HLC', name: 'Hapag-Lloyd', prefixes: ['HLC'] },
  { code: 'MSC', name: 'MSC',         prefixes: ['MSC', 'MEDU'] },
  { code: 'ONE', name: 'ONE',         prefixes: ['ONEY', 'ONEU', 'EBKG', 'NYKU', 'MOLU', 'KKFU', 'MOAU', 'KKLU'] },
];

const SEA_ACTIVE_WHERE = `
  m.active = 1 AND m.tipo_processo = 'SEA EXPORT'
  AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
  AND (
    m.mawb LIKE 'HLC%'  OR m.mawb LIKE 'MSC%'  OR m.mawb LIKE 'MEDU%'
    OR m.mawb LIKE 'ONEY%' OR m.mawb LIKE 'ONEU%' OR m.mawb LIKE 'EBKG%'
    OR m.mawb LIKE 'NYKU%' OR m.mawb LIKE 'MOLU%' OR m.mawb LIKE 'KKFU%'
    OR m.mawb LIKE 'MOAU%' OR m.mawb LIKE 'KKLU%'
  )
  AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
`;

const seaQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'sea');
const finQuery  = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

// ─── CCT result cache (evita consultas repetidas pesadas) ──────────────────────
let cctResultCache = null;
let cctInflight    = null;
const CCT_RESULT_TTL = 60_000; // 60s — alinhado ao staleTime do frontend

// ─── Draft tracking proxy helpers ─────────────────────────────────────────────
const DRAFT_HAPAG_URL = process.env.DRAFT_HAPAG_URL || 'http://localhost:4001';
const DRAFT_MSC_URL   = process.env.DRAFT_MSC_URL   || 'http://localhost:4002';
const DRAFT_ONE_URL   = process.env.DRAFT_ONE_URL   || 'http://localhost:4003';

function getDraftServiceUrl(carrier) {
  const c = (carrier || '').toLowerCase();
  if (c === 'msc') return DRAFT_MSC_URL;
  if (c === 'one') return DRAFT_ONE_URL;
  return DRAFT_HAPAG_URL;
}

// ─── CCT shipments data computation with cache ────────────────────────────────
async function computeCCTData() {
  if (cctResultCache && (Date.now() - cctResultCache.at) < CCT_RESULT_TTL) {
    return cctResultCache.data;
  }
  if (cctInflight) return cctInflight;

  const _parsePipeDateToISO = (s) => {
    const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (!m) return null;
    const [, dd, mm, yyyy, hh = '00', mi = '00', ss = '00'] = m;
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  };

  const _getDeliveredAt = (raw) => {
    if (!raw) return null;
    let arr = [];
    if (Array.isArray(raw)) {
      arr = raw;
    } else if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (trimmed.startsWith('[')) {
        try { arr = JSON.parse(trimmed); } catch { arr = []; }
      } else if (trimmed.includes('|')) {
        arr = trimmed.split('||').map(c => c.trim()).filter(Boolean).map(chunk => {
          const [d, dt] = chunk.split('|').map(s => s.trim());
          return { descricao: d, data_hora_evento: dt ? _parsePipeDateToISO(dt) : null };
        });
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const norm = arr
      .filter(e => e && typeof e === 'object')
      .map(e => {
        const desc = String(e.descricao || e.evento || e.codigo_evento || '').toLowerCase();
        const dt = e.data_hora_evento || e.data_hora || e.dataHora || e.data || null;
        const ts = dt ? new Date(String(dt).replace(' ', 'T')).getTime() : NaN;
        return { desc, dt, ts: isNaN(ts) ? null : ts };
      });
    norm.sort((a, b) => {
      if (a.ts === null && b.ts === null) return 0;
      if (a.ts === null) return 1;
      if (b.ts === null) return -1;
      return a.ts - b.ts;
    });
    const last = norm[norm.length - 1];
    if (!last || !last.desc.includes('entreg') || !last.dt) return null;
    const d = new Date(String(last.dt).replace(' ', 'T'));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };

  async function doCompute() {
    const database = 'dados_dachser';
    
    // Verificar se a tabela existe e tem dados
    let tableCheck = [];
    try {
      tableCheck = await finQuery(`
        SELECT COUNT(*) as cnt FROM ${database}.t_cct_dashboard_cache LIMIT 1
      `);
    } catch (e) {
      console.warn('[CCT] Tabela t_cct_dashboard_cache pode não existir:', e.message);
    }
    
    if (!tableCheck || tableCheck.length === 0 || tableCheck[0]?.cnt === 0) {
      console.warn('[CCT] Nenhum dado em t_cct_dashboard_cache, retornando array vazio');
      return { success: true, data: [] };
    }
    
    const cachedRows = await finQuery(`
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
        COALESCE(m.data_insert, a.created_at, NOW()) AS created_at
      FROM ${database}.t_cct_dashboard_cache c
      LEFT JOIN (
        SELECT t.*
        FROM ${database}.t_master_dados t
        INNER JOIN (
          SELECT TRIM(hawb) COLLATE utf8mb4_unicode_ci AS h, MAX(data_insert) AS max_di
          FROM ${database}.t_master_dados
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
          FROM ${database}.t_dados_aereo t
          WHERE t.hawb_number IS NOT NULL AND TRIM(t.hawb_number) <> ''
        ) x
        WHERE x.rn = 1
      ) a
        ON a.hawb_key COLLATE utf8mb4_unicode_ci = TRIM(c.hawb) COLLATE utf8mb4_unicode_ci
      LEFT JOIN ${database}.t_fato_aereo f
        ON TRIM(f.awb) COLLATE utf8mb4_unicode_ci = TRIM(COALESCE(c.awb, m.mawb, a.awb_number)) COLLATE utf8mb4_unicode_ci
      WHERE c.teve_bloqueio IS NULL
         OR TRIM(c.teve_bloqueio) COLLATE utf8mb4_unicode_ci <> 'Sem retorno CCT' COLLATE utf8mb4_unicode_ci
      ORDER BY c.hawb
    `);
    
    console.log(`[CCT] Query retornou ${cachedRows?.length || 0} linhas`);
    if (cachedRows && cachedRows.length > 0) {
      console.log('[CCT] Primeira linha amostra:', JSON.stringify(cachedRows[0], null, 2).substring(0, 300));
    }

    try {
      await finQuery(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_cct_hidden_hawbs (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          hawb VARCHAR(64) NOT NULL,
          reason VARCHAR(32) NOT NULL DEFAULT 'ENTREGUE',
          delivered_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_cct_hidden_hawbs_hawb (hawb),
          KEY idx_cct_hidden_hawbs_delivered_at (delivered_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      console.warn('CCT hidden: falha ao garantir tabela t_cct_hidden_hawbs:', e.message);
    }

    const newlyDelivered = [];
    for (const row of (cachedRows || [])) {
      const hawb = String(row.hawb || '').trim();
      if (!hawb) continue;
      const deliveredAt = _getDeliveredAt(row.eventos);
      if (deliveredAt) newlyDelivered.push({ hawb, deliveredAt });
    }
    if (newlyDelivered.length > 0) {
      try {
        const values = newlyDelivered.map(() => '(?, ?, ?)').join(', ');
        const params = [];
        for (const x of newlyDelivered) { params.push(x.hawb, 'ENTREGUE', x.deliveredAt); }
        await finQuery(
          `INSERT IGNORE INTO dados_dachser.t_cct_hidden_hawbs (hawb, reason, delivered_at) VALUES ${values}`,
          params
        );
      } catch (e) {
        console.warn('CCT hidden: falha ao persistir entregues:', e.message);
      }
    }

    let hiddenRows = [];
    try {
      hiddenRows = await finQuery(
        `SELECT hawb, delivered_at FROM dados_dachser.t_cct_hidden_hawbs WHERE delivered_at < DATE_SUB(NOW(), INTERVAL 5 DAY)`
      );
    } catch (e) {
      console.warn('CCT hidden: falha ao carregar t_cct_hidden_hawbs:', e.message);
      hiddenRows = [];
    }
    const normalizeCctHawb = (value) => String(value || '').replace(/\s+/g, '').trim().toUpperCase();
    const expiredHidden = new Set();
    for (const r of hiddenRows) {
      const hawb = normalizeCctHawb(r.hawb);
      if (hawb) expiredHidden.add(hawb);
    }
    const visibleRows = (cachedRows || []).filter(r => !expiredHidden.has(normalizeCctHawb(r.hawb)));
    console.log(`CCT: ${cachedRows?.length || 0} total, ${expiredHidden.size} ocultos >5d, ${visibleRows.length} visíveis`);

    const result = { success: true, data: visibleRows };
    cctResultCache = { at: Date.now(), data: result };
    return result;
  }

  cctInflight = doCompute().finally(() => { cctInflight = null; });
  return cctInflight;
}

// ─── SEA AI helpers ────────────────────────────────────────────────────────────

function seaPromptForAnalysisType(analysisType) {
  if (analysisType === 'manifest_hbl') {
    return `You are a senior ocean freight document auditor for DACHSER.

TASK: Compare the provided Manifest (Excel/spreadsheet) against the Draft HBL document(s) (PDF).
Produce a structured operational correction report in English, exactly in the format below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — follow this structure precisely:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Hello, team.

Please update HBL as follows:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DRAFT HBL: [HBL number from the document]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTAINER VERIFICATION:
- Manifest Container: [value]
- HBL Container: [value]
- Status: MATCH | MISMATCH → Update: [correction]

TOTAL WEIGHT:
- Manifest Total (Weight after Weighting): [value] kg
- HBL Total Gross Weight: [value] kg
- Delta: [calculated delta] kg
- Status: MATCH | UPDATE REQUIRED → Update: [correction]

TOTAL CBM:
- Manifest Total: [value] m³
- HBL Total Measurement: [value] m³
- Delta: [calculated delta] m³
- Status: MATCH | UPDATE REQUIRED → Update: [correction]

TOTAL VOLUMES:
- Manifest Total Packages: [value]
- HBL Total Packages: [value]
- Status: MATCH | UPDATE REQUIRED → Update: [correction]

SEAL NUMBER:
- Manifest Seal: [value]
- HBL Seal: [value]
- Status: MATCH | MISMATCH → Update: [correction]

CONSIGNEE CNPJ:
- Manifest VAT No.: [value]
- HBL CNPJ: [value]
- Status: MATCH | MISMATCH → Update: [correction]

NCM CODES:
- Manifest NCMs: [list of NCM codes found in manifest]
- HBL NCMs: [list of NCM codes found in HBL]
- Missing in HBL: [list or "none"]
- Extra in HBL: [list or "none"]
- Status: MATCH | UPDATE REQUIRED → Update: [correction]

INVOICE REFERENCES:
[Brief explanation of whether all manifest invoice refs are present in HBL]
- Status: MATCH | UPDATE REQUIRED → Update: [correction]

EXPORTER/SHIPPER ANALYSIS:
[For EACH exporter/shipper listed in the manifest, output one block:]

EXPORTER #N: [Exporter name]
- CNPJ: Manifest: [value] | HBL: [value] | Status: MATCH | MISMATCH
- Seal: Manifest: [value] | HBL: [value] | Status: MATCH | MISMATCH

Invoice References:
- Manifest invoices: [list]
- HBL invoices: [list]
- Status: MATCH | UPDATE REQUIRED

Manifest Items (reference only — totals verified at exporter level):
  - Item: [description] / [weight] kg / [cbm] m³ / [qty] PALLETS
  [repeat for each item under this exporter; use "within" for sub-items without separate weight/cbm/pallet data]

Subtotals EXPORTER #N:
- Total Weight: Manifest: [value] kg | HBL: [value] kg | Delta: [delta] kg | Status: MATCH | UPDATE REQUIRED
  [if UPDATE REQUIRED: → Update: Adjust HBL total weight for [Exporter] to [manifest value] kg to match manifest.]
- Total CBM: Manifest: [value] m³ | HBL: [value] m³ | Delta: [delta] m³ | Status: MATCH | UPDATE REQUIRED
- Total Volumes: Manifest: [value] | HBL: [value] | Delta: [delta] | Status: MATCH | UPDATE REQUIRED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANALYSIS SUMMARY:
- Total exporters identified: [N]
- Total items analyzed: [N] packages
- Fields with discrepancies: [summary of what needs updating]

VERIFICATION CHECKLIST:
Files analyzed:
- Manifest: [manifest file name]
- Draft HBL: [HBL number or file name]

Explicit verifications:
[✓ or ⚠ for each]: Container, Seal, Shipper, Consignee, CNPJ, NCM Codes, Invoices, Total CBM, Total Volumes, Total Weight

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Use ONLY values explicitly present in the documents. Never invent or approximate.
- Delta tolerance for weight: ≤ 1.000 kg = MATCH. Greater = UPDATE REQUIRED.
- Delta tolerance for CBM: ≤ 0.010 m³ = MATCH. Greater = UPDATE REQUIRED.
- When a field matches, write MATCH. When it differs beyond tolerance, write UPDATE REQUIRED with the correction instruction.
- List ALL exporters found in the manifest, in order.
- For sub-items within the same pallet/box (no independent weight/cbm), write "within" for those fields.
- Keep the exact separator lines (━━━) as shown.

At the end, always append this JSON block (no markdown, on its own line):
\`\`\`json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
\`\`\`
Fill all fields you found; use empty string for unavailable ones.`;
  }

  if (analysisType === 'hbl_mbl') {
    return `You are a senior ocean freight document auditor for DACHSER.

Analysis type: HBL x MBL

Compare the HBL (House Bill of Lading) against the MBL (Master Bill of Lading).
Identify all discrepancies in: container numbers, seal numbers, weights, volumes, CBM, consignee, shipper, notify party, ports, vessel, voyage, freight terms, and any other relevant fields.

Return a clear operational correction report in English with:
1. Field-by-field comparison table (HBL value | MBL value | Status)
2. List of required corrections with exact instructions
3. Summary of risk level

At the end, always append:
\`\`\`json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
\`\`\``;
  }

  if (analysisType === 'invoices_hbl') {
    return `You are a senior ocean freight document auditor for DACHSER.

Analysis type: Invoices x HBL

Compare the commercial invoices and packing lists against the HBL draft.
Verify: invoice numbers present in HBL, NCM codes, weights, volumes, CBM, item descriptions, consignee details, and freight terms.

Return a structured correction report in English with:
1. Invoice references: which are present / missing / extra in HBL
2. NCM codes: manifest vs HBL
3. Weight/CBM/Volume comparison per invoice
4. List of corrections required

At the end, always append:
\`\`\`json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
\`\`\``;
  }

  return `You are a senior ocean freight document auditor for DACHSER.

Analysis type: ${analysisType}

Compare all provided documents with strict documentary evidence. Identify discrepancies, missing information, and recommended corrections.

Return a clear operational report in English.
At the end, always append:
\`\`\`json
{"hbl_shipping_data":{"container":"","consignee":"","vessel":"","voyage":"","origem":"","destino":"","mbl_number":"","carrier":"","ata_date":""}}
\`\`\``;
}

async function seaBuildLlmContent(files) {
  const content = [];
  for (const file of files) {
    const name   = file.name || file.file_name || 'arquivo';
    const mime   = file.mimeType || file.type || file.file_type || 'application/octet-stream';
    let base64   = file.content || file.fileBase64 || null;

    if (!base64 && file.url) {
      const resolvedUrl = file.url.startsWith('/') ? `http://localhost:${PORT}${file.url}` : file.url;
      const response = await fetch(resolvedUrl);
      if (!response.ok) throw new Error(`Falha ao carregar arquivo ${name}: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString('base64');
    }

    if (!base64) {
      content.push({ type: 'text', text: `[Arquivo: ${name}] - sem conteúdo disponível` });
      continue;
    }

    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
      content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      content.push({ type: 'text', text: `[Arquivo PDF: ${name}]` });
    } else if (mime.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: base64 } });
      content.push({ type: 'text', text: `[Imagem: ${name}]` });
    } else if (/spreadsheet|excel/i.test(mime) || /\.(xlsx|xls)$/i.test(name)) {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(Buffer.from(base64, 'base64'), { type: 'buffer', sheetRows: 500 });
        let text = `[Arquivo Excel: ${name}]\n`;
        for (const sheetName of workbook.SheetNames.slice(0, 5)) {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
          text += `\n=== ABA: ${sheetName} ===\n`;
          for (const row of rows.slice(0, 300)) {
            const line = row.map((cell) => String(cell || '').trim()).filter(Boolean).join(' | ');
            if (line) text += `${line}\n`;
          }
        }
        content.push({ type: 'text', text });
      } catch (err) {
        content.push({ type: 'text', text: `[Arquivo Excel: ${name}] - erro ao extrair planilha: ${err.message}` });
      }
    } else {
      content.push({ type: 'text', text: `[Arquivo: ${name}]\n${Buffer.from(base64, 'base64').toString('utf8')}` });
    }
  }
  return content;
}

async function seaAnalyzeWithAnthropic(analysisType, files, context = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');
  const content = await seaBuildLlmContent(files);
  content.push({
    type: 'text',
    text: `${seaPromptForAnalysisType(analysisType)}\n\nContext: ${JSON.stringify(context || {})}`,
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.SEA_ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 32000,
      temperature: 0,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic SEA error ${response.status}: ${errorText.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.content?.find((c) => c.type === 'text')?.text || '';
}

async function seaAnalyzeWithGemini(analysisType, files, context = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY não configurada');
  const parts = [];
  for (const file of files) {
    const name   = file.name || file.file_name || 'arquivo';
    const mime   = file.mimeType || file.type || file.file_type || 'application/octet-stream';
    let base64   = file.content || file.fileBase64 || null;
    if (!base64 && file.url) {
      const resolvedUrl = file.url.startsWith('/') ? `http://localhost:${PORT}${file.url}` : file.url;
      const response = await fetch(resolvedUrl);
      if (!response.ok) throw new Error(`Falha ao carregar arquivo ${name}: ${response.status}`);
      base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
    }
    if (base64 && (mime === 'application/pdf' || mime.startsWith('image/') || /\.pdf$/i.test(name))) {
      parts.push({ type: 'image_url', image_url: { url: `data:${mime || 'application/pdf'};base64,${base64}` } });
    } else if (base64) {
      parts.push({ type: 'text', text: `[Arquivo: ${name}]\n${Buffer.from(base64, 'base64').toString('utf8')}` });
    }
    parts.push({ type: 'text', text: `[Arquivo: ${name}]` });
  }
  parts.push({ type: 'text', text: `${seaPromptForAnalysisType(analysisType)}\n\nContext: ${JSON.stringify(context || {})}` });

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.SEA_GEMINI_MODEL || 'gemini-2.5-pro',
      messages: [{ role: 'user', content: parts }],
      max_tokens: 32000,
      temperature: 0,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini SEA error ${response.status}: ${errorText.slice(0, 300)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

async function seaArbitrateWithOpenAI({ analysisType, claudeText, geminiText }) {
  const key = process.env.OPENAI_API_KEY || process.env.CHB_OPENAI_API_KEY;
  if (!key) return claudeText || geminiText;

  const manifestHblInstructions = analysisType === 'manifest_hbl' ? `
CRITICAL FORMAT RULE for manifest_hbl:
The output MUST start with "Hello, team." and follow the exact "Please update HBL as follows:" structure with:
- DRAFT HBL section
- CONTAINER VERIFICATION, TOTAL WEIGHT, TOTAL CBM, TOTAL VOLUMES, SEAL NUMBER, CONSIGNEE CNPJ, NCM CODES, INVOICE REFERENCES
- EXPORTER/SHIPPER ANALYSIS with per-exporter subtotals
- ANALYSIS SUMMARY and VERIFICATION CHECKLIST

Do NOT reformat, summarize, or merge into a new structure. Pick the analysis that is more complete and structured, fix any factual conflicts using the other as reference, and return the result strictly in the format above.
Keep all ━━━ separator lines exactly as-is.
` : '';

  const prompt = `You are a senior logistics document auditor. Your task is to produce one final authoritative report from the two model analyses below.
${manifestHblInstructions}
Analysis type: ${analysisType}

ANALYSIS A (Claude):
${claudeText || '(not available)'}

ANALYSIS B (Gemini):
${geminiText || '(not available)'}

Instructions:
- Where both analyses agree on a fact, treat it as confirmed.
- Where they conflict, choose the value supported by the most evidence. Do not flag it as "unresolved" — pick the correct one.
- Preserve ALL factual data (weights, CBMs, invoice numbers, NCM codes, exporters, seal numbers). Never omit information present in either analysis.
- Return ONLY the final report, no preamble.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.SEA_OPENAI_MODEL || 'gpt-5.5',
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 16000,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.warn('[sea arbitration] OpenAI failed:', response.status, errorText.slice(0, 200));
    return claudeText || geminiText;
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || claudeText || geminiText;
}

function extractSeaShippingData(resultText = '') {
  const empty = { container: '', consignee: '', vessel: '', voyage: '', origem: '', destino: '', mbl_number: '', carrier: '', ata_date: '' };
  const blocks = resultText.matchAll(/```json\s*(\{[\s\S]*?\})\s*```/g);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      if (parsed.hbl_shipping_data) return { ...empty, ...parsed.hbl_shipping_data };
    } catch (_) {}
  }
  const inline = resultText.match(/\{"hbl_shipping_data"[\s\S]*?\}\}/);
  if (inline) {
    try {
      const parsed = JSON.parse(inline[0]);
      if (parsed.hbl_shipping_data) return { ...empty, ...parsed.hbl_shipping_data };
    } catch (_) {}
  }
  return null;
}

async function processSeaAnalysisRun({ runId, itemId, analysisType, files, context }) {
  try {
    await seaQuery(`UPDATE dados_dachser.t_sea_runs SET status = 'analisando' WHERE id = ?`, [runId]);
    if (itemId) await seaQuery(`UPDATE dados_dachser.t_sea_items SET status = 'analisando' WHERE id = ?`, [itemId]);

    console.log(`[AI_REQUEST_STARTED] [RunID: ${runId}] Calling AI models (Anthropic/Gemini) for Sea Analysis`);

    const [claudeResult, geminiResult] = await Promise.allSettled([
      seaAnalyzeWithAnthropic(analysisType, files, context),
      seaAnalyzeWithGemini(analysisType, files, context),
    ]);
    const claudeText = claudeResult.status === 'fulfilled' ? claudeResult.value : '';
    const geminiText = geminiResult.status === 'fulfilled' ? geminiResult.value : '';
    if (!claudeText && !geminiText) {
      throw new Error(`Falha nas duas análises: ${claudeResult.reason?.message || ''} ${geminiResult.reason?.message || ''}`.trim());
    }

    console.log(`[AI_RESPONSE_RECEIVED] [RunID: ${runId}] AI response received. Proceeding to arbitration with OpenAI`);

    const finalText    = await seaArbitrateWithOpenAI({ analysisType, claudeText, geminiText });

    console.log(`[RESULT_PARSED] [RunID: ${runId}] OpenAI arbitration response received. Extracting shipping data...`);
    const shippingData = extractSeaShippingData(finalText);
    const jsonResult   = {
      model: process.env.OPENAI_API_KEY ? 'multi-model-direct-openai-arbitration' : 'multi-model-direct',
      result_claude: claudeText,
      result_gemini: geminiText,
      hblShippingData: shippingData,
    };

    console.log(`[RESULT_SAVED] [RunID: ${runId}] Saving analysis results to database`);
    await seaQuery(
      `UPDATE dados_dachser.t_sea_runs SET status = 'realizado', result_text = ?, result_json = ? WHERE id = ?`,
      [finalText, JSON.stringify(jsonResult), runId]
    );

    if (itemId) {
      const updateFields = [], updateValues = [];
      if (shippingData?.consignee)  { updateFields.push('consignee = ?');  updateValues.push(shippingData.consignee); }
      if (shippingData?.mbl_number) { updateFields.push('mbl_number = ?'); updateValues.push(shippingData.mbl_number); }
      if (shippingData?.carrier)    { updateFields.push('carrier = ?');    updateValues.push(shippingData.carrier); }
      if (shippingData?.ata_date)   { updateFields.push('ata_date = ?');   updateValues.push(shippingData.ata_date); }
      updateValues.push(itemId);
      await seaQuery(
        `UPDATE dados_dachser.t_sea_items SET ${updateFields.length ? `${updateFields.join(', ')}, ` : ''}status = 'analisado' WHERE id = ?`,
        updateValues
      );
    }
    console.log(`[ANALYSIS_COMPLETED] [RunID: ${runId}] Sea analysis run successfully completed`);
  } catch (err) {
    console.error(`[ANALYSIS_FAILED] [RunID: ${runId}] Sea analysis failed:`, err.message);
    await seaQuery(`UPDATE dados_dachser.t_sea_runs SET status = 'erro', result_text = ? WHERE id = ?`, [err.message, runId]);
    if (itemId) await seaQuery(`UPDATE dados_dachser.t_sea_items SET status = 'erro' WHERE id = ?`, [itemId]);
  }
}

// ─── Registro de rotas ─────────────────────────────────────────────────────────
export function registerSeaRoutes(app, _deps = {}) {

  // ── SEA Export (draft-exportacao) ──────────────────────────────────────────

  // GET /api/sea/draft-exportacao/stats
  app.get('/api/sea/draft-exportacao/stats', async (req, res) => {
    try {
      const [totalRows, lastRows] = await Promise.all([
        seaQuery(`SELECT COUNT(*) AS total FROM dados_dachser.t_master_dados m WHERE ${SEA_ACTIVE_WHERE}`),
        seaQuery(`SELECT MAX(data_insert) AS last_update FROM dados_dachser.t_master_dados WHERE tipo_processo = 'SEA EXPORT'`),
      ]);

      const shippingLineBreakdown = [];
      for (const line of SEA_SHIPPING_LINES) {
        const likeClauses = line.prefixes.map(p => `m.mawb LIKE '${p}%'`).join(' OR ');
        const rows = await seaQuery(`
          SELECT COUNT(*) AS count FROM dados_dachser.t_master_dados m
          WHERE m.active = 1 AND m.tipo_processo = 'SEA EXPORT'
            AND m.mawb IS NOT NULL AND TRIM(m.mawb) != ''
            AND (${likeClauses})
            AND (m.etd >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) OR m.etd IS NULL)
        `);
        shippingLineBreakdown.push({ code: line.code, name: line.name, count: Number(rows[0]?.count ?? 0) });
      }

      res.json({
        success: true,
        stats: {
          lastUpdate: lastRows[0]?.last_update ?? null,
          totalRecords: Number(totalRows[0]?.total ?? 0),
          shippingLineBreakdown,
        },
      });
    } catch (err) {
      console.error('[sea/draft-exportacao/stats]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas SEA.' });
    }
  });

  // GET /api/sea/draft-exportacao
  app.get('/api/sea/draft-exportacao', async (req, res) => {
    try {
      const [mblRows, trackingRows] = await Promise.all([
        seaQuery(`
          SELECT TRIM(m.mawb) AS mbl_id, m.tipo_processo, m.etd, m.cliente AS shipper
          FROM dados_dachser.t_master_dados m
          WHERE ${SEA_ACTIVE_WHERE}
          ORDER BY m.etd DESC, m.mawb
        `),
        seaQuery(`
          SELECT id, mbl_id, booking, origem, destino, navio, voyage,
                 etd, eta, tipo_processo, status_armador,
                 transaction_id, hash_hapag_lloyd, api_endpoint,
                 data_hora_servidor, data_hora_consulta, created_at
          FROM dados_dachser.t_consulta_armador
        `),
      ]);

      const trackingStatus = {};
      for (const row of trackingRows) {
        const key = (row.mbl_id || '').trim();
        if (!key) continue;
        const existing = trackingStatus[key];
        const rowDate  = new Date(row.data_hora_consulta || row.created_at || 0).getTime();
        const exDate   = existing ? new Date(existing.data_hora_consulta || existing.created_at || 0).getTime() : -1;
        if (!existing || rowDate >= exDate) trackingStatus[key] = row;
      }

      res.json({ success: true, mbls: mblRows, trackingStatus });
    } catch (err) {
      console.error('[sea/draft-exportacao]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar dados SEA.' });
    }
  });

  // ── SEA Regras notificação ─────────────────────────────────────────────────

  // GET /api/sea/regras-notificacao
  app.get('/api/sea/regras-notificacao', async (req, res) => {
    try {
      const rows = await seaQuery(
        `SELECT * FROM dados_dachser.t_sea_regras_notificacao ORDER BY is_default DESC, created_at DESC`
      );
      res.json({ success: true, data: rows });
    } catch (err) {
      console.error('[sea/regras-notificacao GET]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar regras.' });
    }
  });

  // POST /api/sea/regras-notificacao
  app.post('/api/sea/regras-notificacao', async (req, res) => {
    try {
      const {
        cliente_nome, cnpj_consignatario, tipo_processo,
        portos_origem, portos_destino, eventos_disparo,
        frequencia, canais, emails_import, emails_export,
        template_id, ativo, is_default,
      } = req.body;

      if (is_default) {
        await seaQuery(`UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE`);
      }
      await seaQuery(`
        INSERT INTO dados_dachser.t_sea_regras_notificacao
          (cliente_nome, cnpj_consignatario, tipo_processo, portos_origem, portos_destino,
           eventos_disparo, frequencia, canais, emails_import, emails_export, template_id, ativo, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        cliente_nome, cnpj_consignatario, tipo_processo || 'BOTH',
        portos_origem || '[]', portos_destino || '[]', eventos_disparo || '[]',
        frequencia || 'IMEDIATO', canais || '[]',
        emails_import, emails_export, template_id || 'default',
        ativo !== false ? 1 : 0, is_default ? 1 : 0,
      ]);
      res.json({ success: true, message: 'Regra criada com sucesso' });
    } catch (err) {
      console.error('[sea/regras-notificacao POST]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao criar regra.' });
    }
  });

  // PATCH /api/sea/regras-notificacao/:id
  app.patch('/api/sea/regras-notificacao/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const {
        cliente_nome, cnpj_consignatario, tipo_processo,
        portos_origem, portos_destino, eventos_disparo,
        frequencia, canais, emails_import, emails_export,
        template_id, ativo, is_default,
      } = req.body;

      if (is_default === true) {
        await seaQuery(
          `UPDATE dados_dachser.t_sea_regras_notificacao SET is_default = FALSE WHERE is_default = TRUE AND id != ?`,
          [id]
        );
      }

      const fields = [], values = [];
      if (cliente_nome      !== undefined) { fields.push('cliente_nome = ?');       values.push(cliente_nome); }
      if (cnpj_consignatario !== undefined){ fields.push('cnpj_consignatario = ?'); values.push(cnpj_consignatario); }
      if (tipo_processo     !== undefined) { fields.push('tipo_processo = ?');       values.push(tipo_processo); }
      if (portos_origem     !== undefined) { fields.push('portos_origem = ?');       values.push(portos_origem); }
      if (portos_destino    !== undefined) { fields.push('portos_destino = ?');      values.push(portos_destino); }
      if (eventos_disparo   !== undefined) { fields.push('eventos_disparo = ?');     values.push(eventos_disparo); }
      if (frequencia        !== undefined) { fields.push('frequencia = ?');          values.push(frequencia); }
      if (canais            !== undefined) { fields.push('canais = ?');              values.push(canais); }
      if (emails_import     !== undefined) { fields.push('emails_import = ?');       values.push(emails_import); }
      if (emails_export     !== undefined) { fields.push('emails_export = ?');       values.push(emails_export); }
      if (template_id       !== undefined) { fields.push('template_id = ?');         values.push(template_id); }
      if (ativo             !== undefined) { fields.push('ativo = ?');               values.push(ativo ? 1 : 0); }
      if (is_default        !== undefined) { fields.push('is_default = ?');          values.push(is_default ? 1 : 0); }

      if (fields.length > 0) {
        values.push(id);
        await seaQuery(
          `UPDATE dados_dachser.t_sea_regras_notificacao SET ${fields.join(', ')} WHERE id = ?`,
          values
        );
      }
      res.json({ success: true, message: 'Regra atualizada com sucesso' });
    } catch (err) {
      console.error('[sea/regras-notificacao PATCH]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao atualizar regra.' });
    }
  });

  // DELETE /api/sea/regras-notificacao/:id
  app.delete('/api/sea/regras-notificacao/:id', async (req, res) => {
    try {
      await seaQuery(`DELETE FROM dados_dachser.t_sea_regras_notificacao WHERE id = ?`, [req.params.id]);
      res.json({ success: true, message: 'Regra excluída com sucesso' });
    } catch (err) {
      console.error('[sea/regras-notificacao DELETE]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao excluir regra.' });
    }
  });

  // ── SEA Marítimo — CRUD items ──────────────────────────────────────────────

  // GET /api/sea/maritimo/items
  app.get('/api/sea/maritimo/items', async (req, res) => {
    try {
      const { analysisType, status, search } = req.query;
      let query = `
        SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
               i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
               i.status, i.active, i.created_at,
               (SELECT COUNT(*) FROM dados_dachser.t_sea_runs r WHERE r.item_id = i.id) AS run_count
        FROM dados_dachser.t_sea_items i
        WHERE i.active = 1
      `;
      const params = [];
      if (analysisType)                    { query += ` AND i.view = ?`;                                                                params.push(analysisType); }
      if (status && status !== 'todos')    { query += ` AND i.status = ?`;                                                              params.push(status); }
      if (search) {
        query += ` AND (i.arquivo_label LIKE ? OR i.consignee LIKE ? OR i.container LIKE ?)`;
        const p = `%${search}%`; params.push(p, p, p);
      }
      query += ` ORDER BY i.created_at DESC`;
      const items = await seaQuery(query, params);
      res.json({ success: true, items: items || [] });
    } catch (err) {
      console.error('[sea/maritimo/items GET]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar itens.' });
    }
  });

  // GET /api/sea/maritimo/items/:id  (mais específico — antes dos filhos)
  app.get('/api/sea/maritimo/items/:id', async (req, res) => {
    try {
      const items = await seaQuery(`
        SELECT i.id, i.view, i.arquivo_id, i.arquivo_label AS base_file_name,
               i.consignee, i.container, i.mbl_number, i.carrier, i.ata_date,
               i.status, i.active, i.created_at
        FROM dados_dachser.t_sea_items i WHERE i.id = ?
      `, [req.params.id]);
      res.json({ success: true, item: items[0] || null });
    } catch (err) {
      console.error('[sea/maritimo/items/:id GET]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar item.' });
    }
  });

  // GET /api/sea/maritimo/items/:id/history
  app.get('/api/sea/maritimo/items/:id/history', async (req, res) => {
    try {
      const id = req.params.id;
      const [items, runs] = await Promise.all([
        seaQuery(`
          SELECT i.id, i.arquivo_id, i.arquivo_label AS base_file_name, i.consignee,
                 i.container, i.status, i.view AS analysis_type, i.created_at
          FROM dados_dachser.t_sea_items i WHERE i.id = ?
        `, [id]),
        seaQuery(`
          SELECT r.id, r.item_id, r.mode, r.thread_id, r.run_id, r.status, r.result_text, r.created_at
          FROM dados_dachser.t_sea_runs r WHERE r.item_id = ?
          ORDER BY r.created_at DESC
        `, [id]),
      ]);
      const arquivoId = items[0]?.arquivo_id;
      let itemFiles = [];
      if (arquivoId) {
        itemFiles = await seaQuery(`
          SELECT f.id, f.filename AS file_name, f.url AS file_url, f.mime AS file_type, f.size_bytes, f.created_at
          FROM dados_dachser.t_sea_files f WHERE f.id = ? ORDER BY f.created_at ASC
        `, [arquivoId]);
      const runsWithFiles = runs.map(r => ({ ...r, files: itemFiles }));
      res.json({ success: true, item: items[0] || { base_file_name: '' }, runs: runsWithFiles });
    } catch (err) {
      console.error('[sea/maritimo/items/:id/history]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar histórico.' });
    }
  });

  // GET /api/sea/maritimo/items/:id/files
  app.get('/api/sea/maritimo/items/:id/files', async (req, res) => {
    try {
      const id = req.params.id;
      const items = await seaQuery(`SELECT arquivo_id FROM dados_dachser.t_sea_items WHERE id = ?`, [id]);
      const arquivoId = items[0]?.arquivo_id;
      const files = await seaQuery(`
        SELECT DISTINCT id, filename, mime, size_bytes, url, rel_path, created_at
        FROM dados_dachser.t_sea_files
        WHERE id = ? OR item_id = ?
        ORDER BY created_at ASC
      `, [arquivoId || 0, id]);
      const baseFile     = files.find(f => f.id === arquivoId);
      const analysisFiles = files.filter(f => f.id !== arquivoId);
      res.json({ success: true, files: analysisFiles, baseFileName: baseFile?.filename || '' });
    } catch (err) {
      console.error('[sea/maritimo/items/:id/files]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar arquivos.' });
    }
  });

  // DELETE /api/sea/maritimo/items/:id  (soft delete)
  app.delete('/api/sea/maritimo/items/:id', async (req, res) => {
    try {
      await seaQuery(`UPDATE dados_dachser.t_sea_items SET active = 0, active_at = NOW() WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[sea/maritimo/items DELETE]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao excluir item.' });
    }
  });

  // ── SEA Marítimo — Análise ─────────────────────────────────────────────────

  // POST /api/sea/maritimo/submit-analysis
  app.post('/api/sea/maritimo/submit-analysis', async (req, res) => {
    const crypto = await import('crypto');
    const requestId = crypto.randomUUID ? crypto.randomUUID() : `sea_${Date.now()}`;
    console.log(`[REQUEST_RECEIVED] [RequestId: ${requestId}] POST /api/sea/maritimo/submit-analysis initiated`);
    let step = 'REQUEST_RECEIVED';

    try {
      const { itemId, analysisType, files = [], fileUrls = [], linkData = null } = req.body || {};
      step = 'FILES_VALIDATED';
      if (!analysisType) {
        console.error(`[FILES_VALIDATED] [RequestId: ${requestId}] Missing analysisType`);
        return res.status(400).json({
          success: false,
          code: 'SEA_MISSING_ANALYSIS_TYPE',
          message: 'analysisType é obrigatório',
          requestId,
          step
        });
      }
      if (analysisType === 'manifest_hbl' && files.length === 0) {
        console.error(`[FILES_VALIDATED] [RequestId: ${requestId}] Missing HBL files`);
        return res.status(400).json({
          success: false,
          code: 'SEA_MISSING_HBL_FILES',
          message: 'At least 1 HBL file is required',
          requestId,
          step
        });
      }
      if (analysisType === 'hbl_mbl' && files.length !== 1) {
        console.error(`[FILES_VALIDATED] [RequestId: ${requestId}] Invalid MBL count`);
        return res.status(400).json({
          success: false,
          code: 'SEA_INVALID_MBL_COUNT',
          message: 'Exactly 1 MBL file is required',
          requestId,
          step
        });
      }
      if (analysisType === 'invoices_hbl' && files.length === 0 && fileUrls.length === 0) {
        console.error(`[FILES_VALIDATED] [RequestId: ${requestId}] No files provided`);
        return res.status(400).json({
          success: false,
          code: 'SEA_NO_FILES_PROVIDED',
          message: 'At least 1 file is required for analysis',
          requestId,
          step
        });
      }

      step = 'MANIFEST_LOADED';
      let actualItemId = itemId ? Number(itemId) : null;
      if (analysisType === 'invoices_hbl' && !actualItemId) {
        const base = files.find(f => /hbl|house|hbol/i.test(f.name)) || fileUrls.find(f => /hbl|house|hbol/i.test(f.name)) || files[0] || fileUrls[0];
        if (base) {
          const fileResult = await seaQuery(
            `INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
            [base.name, base.type || base.mimeType || 'application/pdf', base.size || 0, '', base.url || '']
          );
          const itemResult = await seaQuery(
            `INSERT INTO dados_dachser.t_sea_items (view, arquivo_id, arquivo_label, status, active, created_at) VALUES (?, ?, ?, 'queued', 1, NOW())`,
            ['invoices_hbl', fileResult.insertId, base.name]
          );
          actualItemId = Number(itemResult.insertId);
        }
      }

      step = 'HBL_FILES_LOADED';
      const modeValue = analysisType === 'invoices_hbl' ? 'hbl_mbl' : analysisType;
      if (actualItemId) {
        const existingRuns = await seaQuery(
          `SELECT id, status FROM dados_dachser.t_sea_runs WHERE item_id = ? AND mode = ? AND status IN ('pendente', 'analisando') LIMIT 1`,
          [actualItemId, modeValue]
        );
        if (existingRuns.length > 0) {
          const existingRun = existingRuns[0];
          console.log(`[HBL_FILES_LOADED] [RequestId: ${requestId}] Analysis already in progress: Run ID ${existingRun.id}`);
          return res.json({
            success: true,
            analysisId: String(existingRun.id),
            runId: Number(existingRun.id),
            itemId: actualItemId,
            status: existingRun.status,
            message: 'Análise já está em processamento',
            files: files.length + fileUrls.length
          });
        }
      }

      const runResult = await seaQuery(
        `INSERT INTO dados_dachser.t_sea_runs (item_id, mode, status, created_at) VALUES (?, ?, 'pendente', NOW())`,
        [actualItemId, modeValue]
      );
      const runId = Number(runResult.insertId);

      for (const file of files) {
        await seaQuery(
          `INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [file.name, file.type || file.mimeType || 'application/octet-stream', file.size || 0, '', '', actualItemId || null]
        );
      }
      for (const file of fileUrls) {
        await seaQuery(
          `INSERT INTO dados_dachser.t_sea_files (filename, mime, size_bytes, rel_path, url, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [file.name, file.type || 'application/octet-stream', file.size || 0, '', file.url || '', actualItemId || null]
        );
      }
      if (actualItemId) await seaQuery(`UPDATE dados_dachser.t_sea_items SET status = 'queued' WHERE id = ?`, [actualItemId]);

      const allFiles = [
        ...files.map(f => ({ ...f, mimeType: f.mimeType || f.type })),
        ...fileUrls.map(f => ({ ...f, mimeType: f.type || 'application/octet-stream' })),
      ];

      step = 'AI_REQUEST_STARTED';
      setImmediate(() => {
        processSeaAnalysisRun({ runId, itemId: actualItemId, analysisType, files: allFiles, context: { linkData } })
          .catch(err => console.error(`[sea submit analysis] [RequestId: ${requestId}] unhandled background processing error:`, err.message));
      });

      console.log(`[AI_REQUEST_STARTED] [RequestId: ${requestId}] Background job scheduled. RunID: ${runId}, ItemID: ${actualItemId}`);

      res.json({
        success: true,
        analysisId: String(runId),
        runId,
        itemId: actualItemId,
        status: 'queued',
        message: 'Análise iniciada em background',
        files: allFiles.length,
        requestId
      });
    } catch (err) {
      console.error(`[ANALYSIS_FAILED] [RequestId: ${requestId}] [Step: ${step}] Error:`, err.message);
      res.status(500).json({
        success: false,
        code: 'SEA_AI_REQUEST_FAILED',
        message: 'Não foi possível processar os documentos.',
        technicalMessage: err.message,
        requestId,
        step
      });
    }
  });

  // GET /api/sea/maritimo/analysis/:id
  app.get('/api/sea/maritimo/analysis/:id', async (req, res) => {
    try {
      const rows = await seaQuery(
        `SELECT id, status, result_text, result_json, created_at FROM dados_dachser.t_sea_runs WHERE id = ? LIMIT 1`,
        [req.params.id]
      );
      const run = rows?.[0];
      if (!run) return res.status(404).json({ error: 'Análise não encontrada' });
      let resultData = null;
      try { resultData = run.result_json ? JSON.parse(run.result_json) : null; } catch (_) {}
      const progressMap = {
        pendente:   [10,  'Na fila...'],
        analisando: [60,  'Processando com IA...'],
        realizado:  [100, 'Concluído!'],
        completed:  [100, 'Concluído!'],
        erro:       [100, 'Erro na análise'],
        error:      [100, 'Erro na análise'],
      };
      const [progressPercent, progressMessage] = progressMap[run.status] || [25, 'Processando...'];
      res.json({
        success: true,
        analysis: {
          id: String(run.id), status: run.status,
          progress_percent: progressPercent, progress_step: progressMessage,
          progress_message: progressMessage, result_text: run.result_text,
          result_data: resultData,
          error_message: run.status === 'erro' || run.status === 'error' ? run.result_text : null,
        },
      });
    } catch (err) {
      console.error('[GET /api/sea/maritimo/analysis/:id]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sea/maritimo/complete-analysis
  app.post('/api/sea/maritimo/complete-analysis', async (req, res) => {
    try {
      const { analysisId, itemId, completed } = req.body;
      await seaQuery(
        `UPDATE dados_dachser.t_sea_runs SET status = ? WHERE id = ?`,
        [completed ? 'completed' : 'error', analysisId]
      );
      if (completed) {
        await seaQuery(`UPDATE dados_dachser.t_sea_items SET status = 'realizado' WHERE id = ?`, [itemId]);
        try {
          const itemData = await seaQuery(`SELECT container, consignee FROM dados_dachser.t_sea_items WHERE id = ?`, [itemId]);
          const runData  = await seaQuery(`SELECT result_json FROM dados_dachser.t_sea_runs WHERE item_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`, [itemId]);
          if (itemData.length > 0 && itemData[0].container) {
            const containerNum = itemData[0].container;
            const consignee    = itemData[0].consignee || '';
            let vessel = '', voyage = '', origem = '', destino = '';
            if (runData.length > 0 && runData[0].result_json) {
              try {
                const rj = typeof runData[0].result_json === 'string' ? JSON.parse(runData[0].result_json) : runData[0].result_json;
                if (rj.hblShippingData) {
                  vessel  = rj.hblShippingData.vessel || '';
                  voyage  = rj.hblShippingData.voyage || '';
                  origem  = rj.hblShippingData.origin || rj.hblShippingData.portOfLoading || '';
                  destino = rj.hblShippingData.destination || rj.hblShippingData.portOfDischarge || '';
                }
              } catch (_) {}
            }
            const existing = await seaQuery(`SELECT id FROM dados_dachser.t_container WHERE container = ?`, [containerNum.trim()]);
            if (!existing.length) {
              await seaQuery(
                `INSERT INTO dados_dachser.t_container (container, vessel, voyage, origem, destino, consignee) VALUES (?, ?, ?, ?, ?, ?)`,
                [containerNum.trim(), vessel, voyage, origem, destino, consignee]
              );
            }
          }
        } catch (containerErr) {
          console.error('[complete-analysis] container save error (não crítico):', containerErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[sea/maritimo/complete-analysis]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao completar análise.' });
    }
  });

  // POST /api/sea/maritimo/reextract-metadata
  app.post('/api/sea/maritimo/reextract-metadata', async (req, res) => {
    try {
      const { forceAll, itemId } = req.body;
      let query = `SELECT id, arquivo_label FROM dados_dachser.t_sea_items WHERE active = 1`;
      const params = [];
      if (itemId)        { query += ` AND id = ?`;                                         params.push(itemId); }
      else if (!forceAll){ query += ` AND (consignee IS NULL OR container IS NULL)`; }
      const items = await seaQuery(query, params);
      let processed = 0;
      for (const item of items) {
        const match = item.arquivo_label?.match(/([A-Z]{4}\d{7})/);
        if (match) {
          await seaQuery(`UPDATE dados_dachser.t_sea_items SET container = ? WHERE id = ?`, [match[1], item.id]);
          processed++;
        }
      }
      res.json({ success: true, processed, updated: processed });
    } catch (err) {
      console.error('[sea/maritimo/reextract-metadata]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao reextrair metadados.' });
    }
  });

  // GET /api/sea/maritimo/system-logs
  app.get('/api/sea/maritimo/system-logs', async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const logs  = await seaQuery(`SELECT * FROM dados_dachser.t_sea_runs ORDER BY created_at DESC LIMIT ?`, [limit]);
      res.json({ success: true, logs });
    } catch (err) {
      console.error('[sea/maritimo/system-logs]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar logs.' });
    }
  });

  // GET /api/sea/maritimo/export-report
  app.get('/api/sea/maritimo/export-report', async (req, res) => {
    try {
      const { analysisType, dateFrom, dateTo, status } = req.query;
      let query = `
        SELECT i.id, i.arquivo_label AS arquivo, i.mbl_number, i.carrier AS armador,
               i.consignee AS cliente, i.ata_date AS data_atracacao, i.container,
               i.view AS tipo_analise, i.status, i.created_at AS data_criacao
        FROM dados_dachser.t_sea_items i WHERE i.active = 1
      `;
      const params = [];
      if (analysisType && analysisType !== 'todos') { query += ` AND i.view = ?`;            params.push(analysisType); }
      if (status && status !== 'todos')             { query += ` AND i.status = ?`;           params.push(status); }
      if (dateFrom)                                 { query += ` AND DATE(i.created_at) >= ?`; params.push(dateFrom); }
      if (dateTo)                                   { query += ` AND DATE(i.created_at) <= ?`; params.push(dateTo); }
      query += ` ORDER BY i.created_at DESC LIMIT 5000`;
      const items = await seaQuery(query, params);
      res.json({ success: true, items: items || [] });
    } catch (err) {
      console.error('[sea/maritimo/export-report]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao exportar relatório.' });
    }
  });

  // GET /api/sea/mbls-export
  app.get('/api/sea/mbls-export', async (req, res) => {
    try {
      const rows = await seaQuery(`
        SELECT DISTINCT
          tmd.mawb, tmd.tipo_processo,
          DATE_FORMAT(tmd.etd, '%Y-%m-%d') AS etd,
          DATE_FORMAT(tmd.eta, '%Y-%m-%d') AS eta,
          tmd.shipper, tmd.consignee, tmd.coordenador,
          tmd.origem AS origin, tmd.destino AS destination
        FROM dados_dachser.t_master_dados tmd
        WHERE tmd.tipo_processo LIKE '%SEA%'
          AND tmd.etd >= DATE_SUB(CURDATE(), INTERVAL 2 MONTH)
          AND tmd.mawb IS NOT NULL AND tmd.mawb != ''
        ORDER BY tmd.etd DESC, tmd.mawb
      `);
      const data = rows.map(r => ({
        mawb:          (r.mawb || '').toString().trim(),
        tipo_processo: (r.tipo_processo || '').toString().trim(),
        etd:           r.etd || null, eta: r.eta || null,
        shipper:       r.shipper     ? r.shipper.toString().trim()     : null,
        consignee:     r.consignee   ? r.consignee.toString().trim()   : null,
        coordenador:   r.coordenador ? r.coordenador.toString().trim() : null,
        origin:        r.origin      ? r.origin.toString().trim()      : null,
        destination:   r.destination ? r.destination.toString().trim() : null,
      }));
      res.json({ success: true, data, count: data.length });
    } catch (err) {
      console.error('[sea/mbls-export]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao exportar MBLs.' });
    }
  });

  // ── SEA Exemplos aprovados (IA learning) ──────────────────────────────────

  // GET /api/sea/maritimo/approved-examples/list  (mais específico — antes de /:id)
  app.get('/api/sea/maritimo/approved-examples/list', async (req, res) => {
    try {
      const { analysisType, isActive, limit: lim, offset: off } = req.query;
      let query = `SELECT id, run_id, item_id, analysis_type, scenario_type, hbl_count,
                          consignee, approved_by_name, approved_at, is_active,
                          usage_count, effectiveness_score, last_used_at
                   FROM dados_dachser.t_sea_approved_examples WHERE 1=1`;
      const params = [];
      if (analysisType)  { query += ` AND analysis_type = ?`; params.push(analysisType); }
      if (isActive !== undefined && isActive !== '') { query += ` AND is_active = ?`; params.push(isActive === 'true' ? 1 : 0); }
      query += ` ORDER BY approved_at DESC LIMIT ? OFFSET ?`;
      params.push(Number(lim) || 20, Number(off) || 0);
      const examples = await seaQuery(query, params);

      let cQuery = `SELECT COUNT(*) AS total FROM dados_dachser.t_sea_approved_examples WHERE 1=1`;
      const cParams = [];
      if (analysisType)  { cQuery += ` AND analysis_type = ?`; cParams.push(analysisType); }
      if (isActive !== undefined && isActive !== '') { cQuery += ` AND is_active = ?`; cParams.push(isActive === 'true' ? 1 : 0); }
      const total = await seaQuery(cQuery, cParams);
      res.json({ success: true, examples: examples || [], total: Number(total[0]?.total || 0) });
    } catch (err) {
      console.error('[sea/approved-examples/list]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao listar exemplos.' });
    }
  });

  // GET /api/sea/maritimo/approved-examples
  app.get('/api/sea/maritimo/approved-examples', async (req, res) => {
    try {
      const { analysisType, hblCount, limit: lim } = req.query;
      const maxEx   = Math.min(Number(lim) || 3, 5);
      const examples = await seaQuery(`
        SELECT id, run_id, analysis_type, scenario_type, hbl_count, consignee,
               input_summary, result_text, approved_by_name, approved_at,
               usage_count, effectiveness_score
        FROM dados_dachser.t_sea_approved_examples
        WHERE analysis_type = ? AND is_active = TRUE AND effectiveness_score >= 50
        ORDER BY CASE WHEN hbl_count = ? THEN 0 ELSE 1 END, effectiveness_score DESC, approved_at DESC
        LIMIT ?
      `, [analysisType || '', Number(hblCount) || 1, maxEx]);
      if (examples.length > 0) {
        const ids = examples.map(e => e.id).join(',');
        await seaQuery(`UPDATE dados_dachser.t_sea_approved_examples SET usage_count = usage_count + 1, last_used_at = NOW() WHERE id IN (${ids})`);
      }
      res.json({ success: true, examples: examples || [] });
    } catch (err) {
      console.error('[sea/approved-examples GET]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao buscar exemplos.' });
    }
  });

  // POST /api/sea/maritimo/approved-examples
  app.post('/api/sea/maritimo/approved-examples', async (req, res) => {
    try {
      const { runId, itemId, analysisType, consignee, scenarioType, hblCount, inputSummary, resultText, approvedBy, approvedByName } = req.body;
      if (!runId || !itemId || !analysisType || !resultText) {
        return res.status(400).json({ success: false, error: 'runId, itemId, analysisType e resultText são obrigatórios.' });
      }
      const existing = await seaQuery(`SELECT id FROM dados_dachser.t_sea_approved_examples WHERE run_id = ? LIMIT 1`, [runId]);
      if (existing.length > 0) {
        await seaQuery(
          `UPDATE dados_dachser.t_sea_approved_examples
           SET result_text = ?, scenario_type = ?, hbl_count = ?, input_summary = ?,
               approved_by = ?, approved_by_name = ?, approved_at = NOW(), is_active = TRUE
           WHERE run_id = ?`,
          [resultText, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', approvedBy || null, approvedByName || null, runId]
        );
        return res.json({ success: true, action: 'updated', id: existing[0].id });
      }
      await seaQuery(
        `INSERT INTO dados_dachser.t_sea_approved_examples
           (run_id, item_id, analysis_type, consignee, scenario_type, hbl_count, input_summary, result_text, approved_by, approved_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [runId, itemId, analysisType, consignee || null, scenarioType || '1_hbl', hblCount || 1, inputSummary || '', resultText, approvedBy || null, approvedByName || null]
      );
      const lastId = await seaQuery('SELECT LAST_INSERT_ID() AS id');
      res.json({ success: true, action: 'inserted', id: lastId[0]?.id });
    } catch (err) {
      console.error('[sea/approved-examples POST]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao salvar exemplo.' });
    }
  });

  // PATCH /api/sea/maritimo/approved-examples/:id/toggle
  app.patch('/api/sea/maritimo/approved-examples/:id/toggle', async (req, res) => {
    try {
      const { isActive } = req.body;
      await seaQuery(`UPDATE dados_dachser.t_sea_approved_examples SET is_active = ? WHERE id = ?`, [isActive ? 1 : 0, req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[sea/approved-examples toggle]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao atualizar exemplo.' });
    }
  });

  // DELETE /api/sea/maritimo/approved-examples/:id
  app.delete('/api/sea/maritimo/approved-examples/:id', async (req, res) => {
    try {
      await seaQuery(`DELETE FROM dados_dachser.t_sea_approved_examples WHERE id = ?`, [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[sea/approved-examples DELETE]', err.message);
      res.status(500).json({ success: false, error: 'Erro ao excluir exemplo.' });
    }
  });

  // ─── CCT Shipments ────────────────────────────────────────────────────────────

  // GET /api/sea/cct/shipments
  app.get('/api/sea/cct/shipments', async (req, res) => {
    try {
      const result = await computeCCTData();
      res.json(result);
    } catch (err) {
      console.error('[GET /api/sea/cct/shipments]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/sea/cct/shipments/:id
  app.get('/api/sea/cct/shipments/:id', async (req, res) => {
    try {
      const shipmentId = req.params.id;
      const database = 'dados_dachser';
      const hawbFilter = `(TRIM(c.hawb) = ? OR TRIM(c.hawb_normalizado) = ?)`;

      const shipmentRows = await finQuery(`
        WITH base_cct AS (
          SELECT
            h.id, h.hawb, h.hawb_normalizado, h.data_emissao,
            h.data_consulta_sucesso, h.consulted_at, h.response_http_status,
            h.json_identificacao, h.json_conhecimento_carga_detalhada,
            h.json_partes_estoque, h.json_bloqueios_ativos, h.json_bloqueios_baixados,
            h.json_frete, h.json_manuseios_especiais, h.json_viagens_associadas,
            h.json_divergencias, h.json_mawb_awb_associados, h.json_itens_carga,
            h.json_contatos_consignatario, h.json_documentos_saida,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_identificacao, '$.situacaoPortal')) AS situacao_portal,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.ruc')) AS ruc,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.codigoAeroportoOrigemConhecimento')) AS aeroporto_origem,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.codigoAeroportoDestinoConhecimento')) AS aeroporto_destino,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.identificacaoDocumentoConsignatario')) AS cnpj_consignatario,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.nomeConsignatarioConhecimento')) AS nome_consignatario_leadcomex,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.recintoAduaneiroDestino')) AS recinto_aduaneiro_destino,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.nroMawbAssociado')) AS mawb_associado_fallback,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.indicadorPartesMadeira')) AS indicador_madeira,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.pesoBrutoConhecimento')) AS DECIMAL(18,3)) AS peso_bruto_conhecimento,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(h.json_conhecimento_carga_detalhada, '$.quantidadeVolumesConhecimento')) AS UNSIGNED) AS volumes_conhecimento,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_mawb_awb_associados, '$[0].identificacao')) AS mawb_associado,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_viagens_associadas, '$[0].identificacaoViagem')) AS voo_1,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_viagens_associadas, '$[0].dataPartidaPrevista')) AS voo_1_data_partida,
            JSON_UNQUOTE(JSON_EXTRACT(h.json_partes_estoque, '$[0].situacaoAtual')) AS situacao_estoque_atual,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(h.json_partes_estoque, '$[0].pesoBrutoEstoque')) AS DECIMAL(18,3)) AS peso_bruto_estoque,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(h.json_partes_estoque, '$[0].quantidadeVolumesEstoque')) AS UNSIGNED) AS volumes_estoque,
            JSON_LENGTH(h.json_bloqueios_ativos) AS qtd_bloqueios_ativos
          FROM ${database}.t_cct_hawb_api_atual h
        ),
        aereo_latest AS (
          SELECT * FROM (
            SELECT
              TRIM(a.hawb_number) AS hawb,
              TRIM(a.awb_number) AS awb_number,
              TRIM(a.consignee_nome) AS consignee_nome,
              TRIM(a.clerk) AS clerk,
              TRIM(a.clerk_email) AS clerk_email,
              a.etd, a.eta, a.gross_weight_kg, a.volume_cbm, a.pieces,
              ROW_NUMBER() OVER (PARTITION BY TRIM(a.hawb_number) ORDER BY a.created_at DESC, a.data_emissao DESC) AS rn
            FROM ${database}.t_dados_aereo a
            WHERE a.hawb_number IS NOT NULL AND TRIM(a.hawb_number) <> ''
          ) x WHERE x.rn = 1
        )
        SELECT
          c.id, c.hawb, c.hawb_normalizado, c.data_emissao, c.consulted_at, c.response_http_status,
          COALESCE(a.consignee_nome, c.nome_consignatario_leadcomex) AS cliente,
          a.clerk AS analista, a.clerk_email AS analista_email,
          COALESCE(c.mawb_associado, c.mawb_associado_fallback, a.awb_number) AS master_final,
          c.aeroporto_origem, c.aeroporto_destino,
          c.situacao_estoque_atual, c.situacao_portal,
          c.ruc, c.recinto_aduaneiro_destino, c.cnpj_consignatario, c.indicador_madeira,
          COALESCE(c.peso_bruto_conhecimento, a.gross_weight_kg) AS peso_declarado,
          c.peso_bruto_estoque AS peso_constatado,
          COALESCE(c.volumes_conhecimento, a.pieces) AS volume_declarado,
          c.volumes_estoque AS volume_constatado,
          a.etd, a.eta,
          c.voo_1 AS voo_principal,
          c.voo_1_data_partida AS data_decolagem,
          c.qtd_bloqueios_ativos,
          c.json_frete, c.json_manuseios_especiais, c.json_bloqueios_ativos
        FROM base_cct c
        LEFT JOIN aereo_latest a ON TRIM(a.hawb) COLLATE utf8mb4_unicode_ci = TRIM(c.hawb) COLLATE utf8mb4_unicode_ci
        WHERE ${hawbFilter}
        LIMIT 1
      `, [shipmentId, shipmentId]);

      if (!shipmentRows || shipmentRows.length === 0) {
        return res.status(404).json({ error: 'Shipment não encontrado', success: false });
      }

      const sRow = shipmentRows[0];
      const safeParseJsonDetail = (val) => {
        if (!val) return null;
        try { return typeof val === 'string' ? JSON.parse(val) : val; } catch { return null; }
      };
      const mapStatusTelaDetail = (row) => {
        const se = (row.situacao_estoque_atual || '').toUpperCase().trim();
        const sp = (row.situacao_portal || '').toUpperCase().trim();
        if (se === 'ENTREGUE' || sp === 'ENTREGUE') return 'ENTREGUE';
        if (se === 'RECEPCIONADA' || sp === 'RECEPCIONADA') return 'RECEPCIONADA';
        if (se === 'MANIFESTADA' || sp === 'MANIFESTADA') return 'MANIFESTADA';
        if (row.response_http_status === 200) return 'EM_TRANSITO_TERRESTRE';
        return 'AGUARDANDO_CONSULTA';
      };

      const manuseiosDetail = safeParseJsonDetail(sRow.json_manuseios_especiais) || [];
      const tratamentoDetail = Array.isArray(manuseiosDetail)
        ? manuseiosDetail.map(m => typeof m === 'string' ? m : m?.codigo || m?.code || '').filter(Boolean).join(',')
        : null;
      const freteDetail = safeParseJsonDetail(sRow.json_frete);
      let infoFreteDetail = null;
      if (freteDetail) {
        const moeda = freteDetail.moedaOrigem || freteDetail.moeda || '';
        const formaPgto = freteDetail.formaPgto || freteDetail.forma_pagamento || '';
        let total = 0;
        if (Array.isArray(freteDetail.totaisMoedaOrigem)) {
          const te = freteDetail.totaisMoedaOrigem.find(t => (t?.descricao || '').toLowerCase().includes('total'));
          total = te?.valor || 0;
        } else if (freteDetail.total) { total = freteDetail.total; }
        if (moeda || total > 0) infoFreteDetail = { moeda, formaPgto, total };
      }

      let detailAnalista = (sRow.analista || '').trim() || null;
      let detailAnalistaEmail = (sRow.analista_email || '').trim() || null;
      if (!detailAnalista) {
        const hawbRaw = (sRow.hawb || '').trim();
        const hawbNorm = (sRow.hawb_normalizado || '').trim();
        const lookupKeys = [...new Set([hawbRaw, hawbNorm].filter(Boolean))];
        if (lookupKeys.length > 0) {
          const ph = lookupKeys.map(() => '?').join(',');
          const aRows = await finQuery(
            `SELECT clerk, clerk_email FROM ${database}.t_dados_aereo WHERE hawb_number IN (${ph}) AND clerk IS NOT NULL AND TRIM(clerk) != '' ORDER BY created_at DESC LIMIT 1`,
            lookupKeys
          );
          if (aRows?.[0]?.clerk) {
            detailAnalista = aRows[0].clerk;
            detailAnalistaEmail = aRows[0].clerk_email || null;
          } else {
            const mRows = await finQuery(
              `SELECT nome_analista, email_analista FROM ${database}.t_master_dados WHERE hawb IN (${ph}) AND nome_analista IS NOT NULL AND TRIM(nome_analista) != '' ORDER BY data_insert DESC LIMIT 1`,
              lookupKeys
            );
            if (mRows?.[0]?.nome_analista) {
              detailAnalista = mRows[0].nome_analista;
              detailAnalistaEmail = mRows[0].email_analista || null;
            }
          }
        }
      }

      res.json({
        success: true,
        data: {
          id: (sRow.hawb_normalizado || sRow.hawb || '').trim(),
          house: sRow.hawb || '',
          master: sRow.master_final || '',
          cliente: sRow.cliente || '',
          nome_analista: detailAnalista,
          email_analista: detailAnalistaEmail,
          aeroporto_origem: (sRow.aeroporto_origem || '').trim() || null,
          aeroporto_destino: (sRow.aeroporto_destino || '').trim() || null,
          status_cct_oficial: mapStatusTelaDetail(sRow),
          dep_datetime: sRow.data_decolagem || null,
          data_decolagem_ultimo_trecho: sRow.data_decolagem || null,
          ultimo_evento_data: sRow.consulted_at || null,
          ruc: sRow.ruc || null,
          recinto_aduaneiro: sRow.recinto_aduaneiro_destino || null,
          numero_voo: sRow.voo_principal || null,
          data_emissao: sRow.data_emissao || null,
          indicador_madeira: sRow.indicador_madeira === 'S',
          info_frete: infoFreteDetail,
          rfb_situacao: sRow.situacao_estoque_atual || sRow.situacao_portal || null,
          peso_declarado: sRow.peso_declarado ? Number(sRow.peso_declarado) : null,
          peso_constatado: sRow.peso_constatado ? Number(sRow.peso_constatado) : null,
          volume_declarado: sRow.volume_declarado ? Number(sRow.volume_declarado) : null,
          volume_constatado: sRow.volume_constatado ? Number(sRow.volume_constatado) : null,
          cnpj_consignatario: sRow.cnpj_consignatario || null,
          has_bloqueio: (sRow.qtd_bloqueios_ativos || 0) > 0,
          eta: sRow.eta || null,
          etd: sRow.etd || null,
          tratamento: tratamentoDetail || null,
          manuseios_especiais_rfb: Array.isArray(manuseiosDetail)
            ? manuseiosDetail.map(m => typeof m === 'string' ? m : m?.codigo || m?.code || '').filter(Boolean)
            : [],
        },
      });
    } catch (err) {
      console.error('[GET /api/sea/cct/shipments/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/sea/cct/shipments/:id
  app.patch('/api/sea/cct/shipments/:id', async (req, res) => {
    try {
      const { shipmentId, awbNumber, updates } = req.body;
      const idParam = req.params.id;
      const resolvedShipmentId = shipmentId || idParam;
      const database = 'dados_dachser';

      if (!resolvedShipmentId && !awbNumber) {
        return res.status(400).json({ error: 'shipmentId ou awbNumber é obrigatório' });
      }
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'updates é obrigatório' });
      }

      const cctFields = [
        'peso_declarado', 'peso_constatado', 'peso_bruto', 'peso_real',
        'volume_declarado', 'volume_constatado', 'volume',
        'eta', 'etd', 'data_decolagem_ultimo_trecho',
        'tratamentos_especiais', 'tratamento_especial',
        'cnpj_consignatario'
      ];
      const statusFieldMapping = {
        nome_analista: 'nome_analista',
        email_analista: 'email_analista',
        emails_cliente: 'email_cliente',
      };

      const cctUpdates = {};
      const statusUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (cctFields.includes(key)) {
          const normalizedKey = key === 'peso_bruto' || key === 'peso_real' ? 'peso_declarado'
            : key === 'volume' ? 'volume_declarado'
            : key === 'tratamento_especial' ? 'tratamentos_especiais'
            : key;
          cctUpdates[normalizedKey] = value;
        } else if (statusFieldMapping[key]) {
          statusUpdates[statusFieldMapping[key]] = value;
        } else {
          statusUpdates[key] = value;
        }
      }

      const masterAwb = (awbNumber || '').trim();
      if (Object.keys(cctUpdates).length > 0) {
        const cctColumns = ['master', ...Object.keys(cctUpdates), 'updated_at'];
        const cctValues = [masterAwb, ...Object.values(cctUpdates), new Date()];
        const updateClauses = Object.keys(cctUpdates).map(col => `${col} = VALUES(${col})`).join(', ');
        await finQuery(
          `INSERT INTO ${database}.t_cct_shipments (${cctColumns.join(', ')}) VALUES (${cctColumns.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updateClauses}, updated_at = NOW()`,
          cctValues
        );
      }
      if (Object.keys(statusUpdates).length > 0) {
        const setClauses = [];
        const values = [];
        for (const [key, value] of Object.entries(statusUpdates)) {
          setClauses.push(`${key} = ?`);
          values.push(value);
        }
        const whereClause = resolvedShipmentId ? `id = ?` : `TRIM(awb) = ?`;
        values.push(resolvedShipmentId || masterAwb);
        await finQuery(
          `UPDATE ${database}.t_status_aereo SET ${setClauses.join(', ')} WHERE ${whereClause}`,
          values
        );
      }
      res.json({ success: true, message: 'Shipment atualizado' });
    } catch (err) {
      console.error('[PATCH /api/sea/cct/shipments/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/sea/cct/analytics
  app.get('/api/sea/cct/analytics', async (req, res) => {
    try {
      const database = 'dados_dachser';
      const statusCounts = await finQuery(`
        SELECT \`último_status\` as status, COUNT(*) as count
        FROM ${database}.t_status_aereo
        WHERE \`último_status\` NOT IN ('DLV', 'POD', 'FINALIZADO')
        GROUP BY \`último_status\`
        ORDER BY count DESC
      `);
      const alertCounts = await finQuery(`
        SELECT COUNT(*) as count FROM ${database}.t_status_aereo WHERE \`último_status\` IN ('DIS', 'OFLD')
      `);
      const staleShipments = await finQuery(`
        SELECT COUNT(*) as count FROM ${database}.t_status_aereo
        WHERE \`último_status\` NOT IN ('DLV', 'POD', 'FINALIZADO')
        AND \`última atualização\` < DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `);
      const dailyEvents = await finQuery(`
        SELECT DATE(\`última atualização\`) as date, COUNT(*) as count
        FROM ${database}.t_status_aereo
        WHERE \`última atualização\` >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(\`última atualização\`)
        ORDER BY date DESC
      `);
      res.json({
        success: true,
        data: {
          statusDistribution: statusCounts || [],
          alertCount: alertCounts?.[0]?.count || 0,
          staleCount: staleShipments?.[0]?.count || 0,
          dailyEvents: dailyEvents || [],
        }
      });
    } catch (err) {
      console.error('[GET /api/sea/cct/analytics]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/sea/cct/profiles
  app.get('/api/sea/cct/profiles', async (req, res) => {
    try {
      const database = 'dados_dachser';
      const analysts = await finQuery(`
        SELECT DISTINCT nome_analista as nome, email_analista as email
        FROM ${database}.t_status_aereo
        WHERE nome_analista IS NOT NULL AND nome_analista != ''
        ORDER BY nome_analista
      `);
      const profiles = (analysts || []).map((row, index) => ({
        id: `analyst-${index + 1}`,
        nome: row.nome || '',
        email: row.email || '',
        ativo: true,
      }));
      res.json({ success: true, data: profiles });
    } catch (err) {
      console.error('[GET /api/sea/cct/profiles]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/sea/cct/events
  app.get('/api/sea/cct/events', async (req, res) => {
    try {
      const queryAwb = req.query.shipment_id || req.query.awb;
      if (!queryAwb) {
        return res.status(400).json({ error: 'AWB é obrigatório (query param: shipment_id ou awb)' });
      }
      const database = 'dados_dachser';
      const rawHawb = String(queryAwb).trim();
      const hawbNorm = rawHawb.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      const mapSituacao = (situacao) => {
        const lower = (situacao || '').toLowerCase().trim();
        if (lower.includes('entregue')) return 'ENTREGUE';
        if (lower.includes('chegada') && lower.includes('inform')) return 'CHEGADA_INFORMADA';
        if (lower.includes('recepc')) return 'RECEPCIONADO';
        if ((lower.includes('trânsito') || lower.includes('transito')) && lower.includes('terre')) return 'EM_TRANSITO_TERRESTRE';
        if (lower.includes('transferência') || lower.includes('transferencia')) return 'AREA_TRANSFERENCIA';
        if (lower.includes('troca') && lower.includes('recint')) return 'EM_TROCA_RECINTOS';
        if (lower.includes('manifest')) return 'MANIFESTADO';
        if (lower.includes('inform')) return 'CHEGADA_INFORMADA';
        if (lower.includes('bloque')) return 'BLOQUEIO';
        return (situacao || '').toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      };

      const toIso = (s) => {
        if (!s) return null;
        const trimmed = String(s).trim();
        let m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
        if (m) {
          const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}-03:00`);
          return isNaN(d.getTime()) ? null : d.toISOString();
        }
        m = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
        if (m) {
          const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] || '00'}:${m[5] || '00'}:${m[6] || '00'}-03:00`);
          return isNaN(d.getTime()) ? null : d.toISOString();
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d.toISOString();
      };

      const cacheRows = await finQuery(`
        SELECT eventos, situacao_portal_atual, data_ultima_atualizacao_atual
        FROM ${database}.t_cct_dashboard_cache
        WHERE hawb COLLATE utf8mb4_unicode_ci = ?
           OR REPLACE(REPLACE(UPPER(hawb),'-',''),' ','') COLLATE utf8mb4_unicode_ci = ?
        LIMIT 1
      `, [rawHawb, hawbNorm]);

      if (!cacheRows || cacheRows.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const row = cacheRows[0];
      const parseEventos = (raw) => {
        if (!raw) return [];
        let arr = [];
        if (Array.isArray(raw)) {
          arr = raw;
        } else if (typeof raw === 'string') {
          const trimmed = raw.trim();
          if (!trimmed) return [];
          if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
            try {
              const parsed = JSON.parse(trimmed);
              arr = Array.isArray(parsed) ? parsed : [];
            } catch { arr = []; }
          } else if (trimmed.includes('|')) {
            return trimmed.split('||').map(c => c.trim()).filter(c => c.length > 0)
              .map((chunk, idx) => {
                const [descPart, datePart] = chunk.split('|').map(s => s.trim());
                return { descricao: descPart || '', dataIso: toIso(datePart || null), idx };
              }).filter(e => e.descricao);
          }
        }
        return arr.filter(e => e && typeof e === 'object').map((e, idx) => {
          const descricao = e.descricao || e.descricao_evento || e.evento || e.situacao || e.situacao_portal || e.codigo_evento || e.codigo || '';
          const dateRaw = e.data_hora_evento || e.data_hora || e.dataHora || e.data || e.dataEvento || e.timestamp || e.dt || null;
          return { descricao, dataIso: toIso(dateRaw), idx };
        }).filter(e => e.descricao);
      };

      const parsed = parseEventos(row.eventos);
      parsed.sort((a, b) => {
        const ta = a.dataIso ? new Date(a.dataIso).getTime() : null;
        const tb = b.dataIso ? new Date(b.dataIso).getTime() : null;
        if (ta === null && tb === null) return a.idx - b.idx;
        if (ta === null) return 1;
        if (tb === null) return -1;
        if (tb !== ta) return tb - ta;
        return a.idx - b.idx;
      });

      const allEvents = parsed.map((e, i) => {
        const codigo = mapSituacao(e.descricao);
        const iso = e.dataIso || '1970-01-01T00:00:00.000Z';
        return {
          id: `cct-${queryAwb}-${i}-${codigo}`,
          awb: queryAwb,
          codigo_evento: codigo,
          descricao_evento: e.descricao,
          data_hora_evento: iso,
          fonte: 'RFB',
          aeroporto: null,
          nivel_confianca: 'PRIMARIA',
          created_at: iso,
        };
      });

      res.json({ success: true, data: allEvents });
    } catch (err) {
      console.error('[GET /api/sea/cct/events]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Vessel IMO ───────────────────────────────────────────────────────────────

  // POST /api/sea/resolve-vessel-imo
  app.post('/api/sea/resolve-vessel-imo', async (req, res) => {
    try {
      const shipperName = typeof req.body?.shipperName === 'string' ? req.body.shipperName
        : (typeof req.body?.vesselName === 'string' ? req.body.vesselName : '');
      if (!shipperName || shipperName.trim().length < 2) {
        return res.status(400).json({ error: 'shipperName required (min 2 chars)' });
      }
      const normalized = shipperName.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 120);

      await queryWithRetry(`
        CREATE TABLE IF NOT EXISTS dados_dachser.t_vessel_registry (
          vessel_name_normalized VARCHAR(120) NOT NULL,
          vessel_name_original VARCHAR(180) NULL,
          imo VARCHAR(20) NULL,
          mmsi VARCHAR(20) NULL,
          flag VARCHAR(80) NULL,
          source VARCHAR(20) NULL,
          hit_count INT NOT NULL DEFAULT 1,
          last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (vessel_name_normalized)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      const cached = await queryWithRetry(
        'SELECT imo, mmsi FROM dados_dachser.t_vessel_registry WHERE vessel_name_normalized = ? LIMIT 1',
        [normalized]
      );
      if (cached.length > 0 && cached[0].imo) {
        await queryWithRetry('UPDATE dados_dachser.t_vessel_registry SET hit_count = hit_count + 1 WHERE vessel_name_normalized = ?', [normalized]);
        return res.json({ imo: cached[0].imo, mmsi: cached[0].mmsi || null, source: 'cache' });
      }

      let scraped = null;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const httpRes = await fetch(`https://www.vesselfinder.com/vessels?name=${encodeURIComponent(normalized)}`, {
          signal: ctrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        clearTimeout(t);
        if (httpRes.ok) {
          const html = await httpRes.text();
          const m1 = html.match(/\/vessels\/details\/(\d{7})/);
          const m2 = html.match(/data-imo=["'](\d{7})["']/);
          if (m1) scraped = { imo: m1[1] };
          else if (m2) scraped = { imo: m2[1] };
        }
      } catch (scrapeErr) {
        console.log('[resolve-vessel-imo] scrape failed:', scrapeErr.message);
      }

      if (scraped?.imo) {
        await queryWithRetry(
          `INSERT INTO dados_dachser.t_vessel_registry (vessel_name_normalized, vessel_name_original, imo, mmsi, source)
           VALUES (?, ?, ?, ?, 'scrape')
           ON DUPLICATE KEY UPDATE imo = VALUES(imo), mmsi = VALUES(mmsi), source = 'scrape', hit_count = hit_count + 1`,
          [normalized, shipperName.trim().slice(0, 180), scraped.imo, scraped.mmsi || null]
        );
        return res.json({ imo: scraped.imo, mmsi: scraped.mmsi || null, source: 'scrape' });
      }

      res.json({ source: 'none' });
    } catch (err) {
      console.error('[POST /api/sea/resolve-vessel-imo]', err.message);
      res.json({ source: 'none', error: err.message });
    }
  });

  // ─── Draft tracking proxy ─────────────────────────────────────────────────────

  // POST /api/sea/draft/track
  app.post('/api/sea/draft/track', async (req, res) => {
    try {
      const { carrier, searchType, searchValue } = req.body || {};
      if (!searchValue) return res.status(400).json({ success: false, error: 'searchValue é obrigatório' });
      const baseUrl = getDraftServiceUrl(carrier);
      const upstream = await fetch(`${baseUrl}/api/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchType: searchType || 'BL', searchValue }),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      console.error('[POST /api/sea/draft/track]', err.message);
      res.status(502).json({ success: false, error: `Serviço de tracking indisponível: ${err.message}` });
    }
  });

  // POST /api/sea/draft/save
  app.post('/api/sea/draft/save', async (req, res) => {
    try {
      const { trackingData } = req.body || {};
      if (!trackingData?.mbl_id) return res.status(400).json({ success: false, error: 'trackingData.mbl_id é obrigatório' });
      const { mbl_id, booking, origem, destino, navio, voyage, etd, eta, status_armador, transaction_id } = trackingData;
      await queryWithRetry(
        `INSERT INTO dados_dachser.t_consulta_armador
           (mbl_id, booking, origem, destino, navio, voyage, etd, eta,
            tipo_processo, status_armador, transaction_id, data_hora_consulta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SEA EXPORT', ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           booking          = COALESCE(VALUES(booking), booking),
           origem           = COALESCE(VALUES(origem), origem),
           destino          = COALESCE(VALUES(destino), destino),
           navio            = COALESCE(VALUES(navio), navio),
           voyage           = COALESCE(VALUES(voyage), voyage),
           etd              = COALESCE(VALUES(etd), etd),
           eta              = COALESCE(VALUES(eta), eta),
           status_armador   = VALUES(status_armador),
           transaction_id   = COALESCE(VALUES(transaction_id), transaction_id),
           data_hora_consulta = NOW()`,
        [mbl_id, booking || null, origem || null, destino || null, navio || null,
         voyage || null, etd || null, eta || null, status_armador || null, transaction_id || null]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/sea/draft/save]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Sea files ────────────────────────────────────────────────────────────────

  // GET /api/sea/files/:id/download
  app.get('/api/sea/files/:id/download', async (req, res) => {
    try {
      const rows = await seaQuery(
        `SELECT filename, mime, file_content FROM dados_dachser.t_sea_files WHERE id = ?`,
        [req.params.id]
      );
      if (!rows || rows.length === 0) return res.status(404).json({ error: 'Arquivo não encontrado' });
      const { filename, mime, file_content } = rows[0];
      if (!file_content) return res.status(404).json({ error: 'Conteúdo não disponível' });
      res.setHeader('Content-Type', mime || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename || 'arquivo')}"`);
      res.send(file_content);
    } catch (err) {
      console.error('[GET /api/sea/files/:id/download]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sea/upload-base-file
  app.post('/api/sea/upload-base-file', async (req, res) => {
    try {
      const { file_name, file_base64, mime_type, analysisType } = req.body || {};
      if (!file_name || !file_base64 || !analysisType) {
        return res.status(400).json({ error: 'file_name, file_base64 e analysisType são obrigatórios' });
      }
      const base64Data = file_base64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const containerMatch = file_name.match(/\b([A-Z]{4}\d{7})\b/);
      const container = containerMatch?.[1] || null;

      const fileResult = await seaQuery(
        `INSERT INTO dados_dachser.t_sea_files (filename, mime, rel_path, url, size_bytes, file_content, created_at)
         VALUES (?, ?, '', '', ?, ?, NOW())`,
        [file_name, mime_type || 'application/octet-stream', fileBuffer.length, fileBuffer]
      );
      const arquivoId = fileResult.insertId;
      const fileUrl = `/api/sea/files/${arquivoId}/download`;
      await seaQuery(`UPDATE dados_dachser.t_sea_files SET url = ? WHERE id = ?`, [fileUrl, arquivoId]);

      const itemResult = await seaQuery(
        `INSERT INTO dados_dachser.t_sea_items (view, arquivo_id, arquivo_label, container, consignee, status, active, created_at)
         VALUES (?, ?, ?, ?, NULL, 'pendente', 1, NOW())`,
        [analysisType, arquivoId, file_name, container]
      );
      const itemId = itemResult.insertId;

      res.json({
        success: true,
        item: {
          id: String(itemId),
          base_file_name: file_name,
          base_file_url: fileUrl,
          consignee: null,
          container,
          status: 'pendente',
          analysis_type: analysisType,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error('[POST /api/sea/upload-base-file]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sea/extract-attachments
  app.post('/api/sea/extract-attachments', async (req, res) => {
    try {
      const { file_name, file_base64 } = req.body || {};
      if (!file_name || !file_base64) {
        return res.status(400).json({ success: false, error: 'file_name e file_base64 são obrigatórios' });
      }
      const base64Data = file_base64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(base64Data, 'base64');
      const fileName = file_name.toLowerCase();

      const classifyFile = (name) => {
        const n = name.toLowerCase();
        if (['invoice', 'fatura', 'nota', 'proforma', 'pro forma', 'inv'].some(k => n.includes(k))) return 'invoice';
        if (['hbl', 'hb/l', 'hb-l', 'house bill', 'house-bill'].some(k => n.includes(k))) return 'hbl';
        if (/\.(xlsx?|csv)$/i.test(n)) return 'invoice';
        return 'other';
      };

      const storeExtractedFile = async (name, buffer, mime) => {
        const r = await seaQuery(
          `INSERT INTO dados_dachser.t_sea_files (filename, mime, rel_path, url, size_bytes, file_content, created_at)
           VALUES (?, ?, '', '', ?, ?, NOW())`,
          [name, mime || 'application/octet-stream', buffer.length, buffer]
        );
        const fid = r.insertId;
        await seaQuery(`UPDATE dados_dachser.t_sea_files SET url = ? WHERE id = ?`, [`/api/sea/files/${fid}/download`, fid]);
        return fid;
      };

      let extracted = [];

      if (fileName.endsWith('.zip')) {
        const { unzipSync } = await import('fflate');
        const files = unzipSync(new Uint8Array(fileBuffer));
        for (const [entryName, data] of Object.entries(files)) {
          const baseName = entryName.split('/').pop() || entryName;
          if (!/\.(pdf|xlsx?|csv)$/i.test(baseName) || data.length < 100) continue;
          const mime = /\.pdf$/i.test(baseName) ? 'application/pdf' : 'application/octet-stream';
          const fid = await storeExtractedFile(baseName, Buffer.from(data), mime);
          extracted.push({ name: baseName, url: `/api/sea/files/${fid}/download`, classification: classifyFile(baseName), size: data.length });
        }
      } else if (fileName.endsWith('.eml')) {
        const content = fileBuffer.toString('utf8');
        const boundaryMatches = [...content.matchAll(/boundary[=:][\s]*["']?([^"'\r\n;]+)/gi)];
        const boundaries = boundaryMatches.map(m => m[1].replace(/["']/g, '').trim()).filter(Boolean);

        const patterns = [
          /Content-Disposition:\s*attachment[^]*?filename[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
          /Content-Type:\s*application\/pdf[^]*?name[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
          /name[=*]*["']?([^"'\r\n;]+\.pdf)["']?/gi,
        ];
        const found = [];
        for (const pat of patterns) {
          let m;
          while ((m = pat.exec(content)) !== null) {
            const name = m[1].replace(/.*[/\\]/, '').trim();
            if (name && !found.some(f => f.name === name)) found.push({ name, pos: m.index });
          }
        }

        for (const att of found) {
          try {
            const after = content.substring(att.pos);
            if (!/Content-Transfer-Encoding:\s*base64/i.test(after)) continue;
            const headerEnd = after.indexOf('\r\n\r\n');
            if (headerEnd === -1) continue;
            let b64 = after.substring(headerEnd + 4);
            let endPos = b64.length;
            for (const b of boundaries) {
              const p = b64.indexOf('--' + b);
              if (p !== -1 && p < endPos) endPos = p;
            }
            const nextContent = b64.search(/\r\nContent-/i);
            if (nextContent !== -1 && nextContent < endPos) endPos = nextContent;
            b64 = b64.substring(0, endPos).replace(/[\r\n\s]/g, '').trim();
            if (b64.length < 100) continue;
            const bytes = Buffer.from(b64, 'base64');
            if (!bytes.subarray(0, 5).toString('ascii').startsWith('%PDF')) continue;
            const fid = await storeExtractedFile(att.name, bytes, 'application/pdf');
            extracted.push({ name: att.name, url: `/api/sea/files/${fid}/download`, classification: classifyFile(att.name), size: bytes.length });
          } catch (_) {}
        }
      } else {
        return res.status(400).json({ success: false, error: 'Apenas arquivos .zip e .eml são suportados' });
      }

      extracted = extracted.filter(f => f.size >= 100);
      res.json({ success: true, extracted, source: file_name });
    } catch (err) {
      console.error('[POST /api/sea/extract-attachments]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─── Sea tracking email ───────────────────────────────────────────────────────

  // POST /api/sea/tracking/send-status-email
  app.post('/api/sea/tracking/send-status-email', async (req, res) => {
    try {
      const p = req.body || {};
      const to = p.to || p.email_cliente;
      if (!to) return res.status(400).json({ success: false, error: 'Campo "to" é obrigatório' });

      const logoUrl = process.env.EMAIL_LOGO_URL || 'https://i.ibb.co/sJkY7y5/logo-branco.png';
      const isExterno = p.email_type === 'externo';

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0d1a;margin:0;padding:0}
.wrap{max-width:600px;margin:32px auto;background:#111322;border-radius:16px;border:1px solid rgba(255,255,255,.1);overflow:hidden}
.header{background:linear-gradient(135deg,#1a1d36,#0c0d1a);padding:28px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,.08)}
.header img{height:32px}
.body{padding:32px}
.title{font-size:20px;font-weight:700;color:#f5f5f5;margin:0 0 8px}
.sub{font-size:13px;color:#888;margin:0 0 28px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)}
.label{font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.06em}
.value{font-size:14px;color:#f5f5f5;font-weight:600;text-align:right}
.status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.04em;background:#1e3a5f;color:#60a5fa;margin-top:4px}
.msg{background:rgba(245,184,67,.08);border:1px solid rgba(245,184,67,.2);border-radius:10px;padding:16px;margin-top:24px;font-size:13px;color:#f0d080;line-height:1.6}
.footer{padding:20px 32px;text-align:center;font-size:11px;color:#444;border-top:1px solid rgba(255,255,255,.06)}
</style></head><body>
<div class="wrap">
  <div class="header"><img src="${logoUrl}" alt="Z3US"></div>
  <div class="body">
    <div class="title">Atualização de Rastreamento Marítimo</div>
    <div class="sub">Dachser · Logistics Intelligence</div>
    <div class="row"><span class="label">BL / MBL</span><span class="value">${p.mbl||p.container||'-'}</span></div>
    ${p.hbl ? `<div class="row"><span class="label">HBL</span><span class="value">${p.hbl}</span></div>` : ''}
    ${p.consignee||p.cliente ? `<div class="row"><span class="label">Consignee</span><span class="value">${p.consignee||p.cliente}</span></div>` : ''}
    <div class="row"><span class="label">Armador</span><span class="value">${p.shipping_line||'-'}</span></div>
    ${p.vessel ? `<div class="row"><span class="label">Navio</span><span class="value">${p.vessel}</span></div>` : ''}
    <div class="row"><span class="label">Origem → Destino</span><span class="value">${p.origem||'-'} → ${p.destino||'-'}</span></div>
    ${p.eta ? `<div class="row"><span class="label">ETA</span><span class="value">${p.eta}</span></div>` : ''}
    <div class="row"><span class="label">Status</span><span class="value"><span class="status-badge">${p.status||'—'}</span></span></div>
    ${p.custom_message ? `<div class="msg">${p.custom_message}</div>` : ''}
  </div>
  <div class="footer">© Z3US.AI — Esteira de Rastreamento</div>
</div></body></html>`;

      const subject = isExterno
        ? `Atualização de Embarque — ${p.mbl||p.container||'BL'}`
        : `[INTERNO] Status Tracking: ${p.mbl||p.container||'BL'} — ${p.status||''}`;

      await resend.emails.send({
        from: 'Dachser Tracking <noreply@z3us.ai>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      });
      res.json({ success: true });
    } catch (e) {
      console.error('[POST /api/sea/tracking/send-status-email]', e.message);
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

