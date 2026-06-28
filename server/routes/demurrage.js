/**
 * server/routes/demurrage.js
 * Rotas de demurrage: /api/demurrage/*
 * Pool: fin (dados_dachser)
 */
import { getPoolFor, queryWithRetry } from '../db/pools.js';

const finQuery = (sql, params = []) => queryWithRetry(sql, params, 1, 'fin');

// ─── Helpers de e-mail ────────────────────────────────────────────────────────

function demurrageFormatDateBR(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function demurrageEscapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildDemurrageAlertHtml(payload) {
  const containers = Array.isArray(payload.containers) ? payload.containers : [];
  const rows = containers.map((c) => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #d1d5db;">${demurrageEscapeHtml(c.number || c.container_number || '-')}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageEscapeHtml(c.type || c.size || '-')}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageFormatDateBR(c.discharge_date)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageFormatDateBR(c.return_deadline)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageFormatDateBR(c.return_date)}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageEscapeHtml(c.free_time_days ?? '-')}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:center;">${demurrageEscapeHtml(c.days_incident ?? c.days_possession ?? '-')}</td>
      <td style="padding:6px 8px;border:1px solid #d1d5db;text-align:right;">USD ${Number(c.total_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('');
  const totalUsd = Number(payload.total_usd || containers.reduce((sum, c) => sum + Number(c.total_usd || 0), 0));
  const testBanner = payload.test_mode
    ? '<div style="background:#facc15;color:#111827;text-align:center;padding:10px;font-weight:700;margin-bottom:18px;">E-MAIL DE TESTE - NAO ENCAMINHAR</div>'
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;background:#ffffff;color:#1f2937;font-size:14px;line-height:1.55;">
  ${testBanner}
  <p>Prezados(as),</p>
  <p>Identificamos custos de D&amp;D - Sobreestadia de Contêineres referentes ao(s) embarque(s) mencionado(s) abaixo:</p>
  <table style="border-collapse:collapse;margin:14px 0;font-size:13px;">
    <tr><td style="padding:4px 14px 4px 0;font-weight:700;">Cliente:</td><td>${demurrageEscapeHtml(payload.client_name || 'N/A')}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;font-weight:700;">House BL:</td><td>${demurrageEscapeHtml(payload.house_bl || 'N/A')}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;font-weight:700;">MBL:</td><td>${demurrageEscapeHtml(payload.shipment_master || 'N/A')}</td></tr>
    <tr><td style="padding:4px 14px 4px 0;font-weight:700;">Total USD:</td><td>USD ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
  </table>
  ${containers.length ? `
  <table style="border-collapse:collapse;margin:16px 0;font-size:12px;width:100%;">
    <thead><tr style="background:#003369;color:#ffffff;">
      <th style="padding:8px;border:1px solid #003369;text-align:left;">Container</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">Tipo</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">ATA</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">Limite</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">Devolucao</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">Free Time</th>
      <th style="padding:8px;border:1px solid #003369;text-align:center;">Dias excedidos</th>
      <th style="padding:8px;border:1px solid #003369;text-align:right;">Valor</th>
    </tr></thead><tbody>${rows}</tbody>
  </table>` : ''}
  <p>Caso haja alguma divergência, solicitamos que seja sinalizada com a devida evidência no prazo de 48 horas a contar desta data.</p>
  <p>Após este período, os custos serão considerados válidos e será emitida Nota de Débito para pagamento.</p>
  <p>Atenciosamente,<br/>Time Demurrage &amp; Detention<br/>Air &amp; Sea Logistics Brazil</p>
</body></html>`;
}

async function buildDemurrageHealthCheck(resend, testEmail) {
  const startTime = Date.now();
  const services = [];

  const dbStart = Date.now();
  try {
    await finQuery('SELECT 1');
    services.push({
      service: 'Database',
      status: 'healthy',
      latency_ms: Date.now() - dbStart,
      message: 'MariaDB accessible',
      last_checked: new Date().toISOString(),
    });
  } catch (err) {
    services.push({
      service: 'Database',
      status: 'unhealthy',
      latency_ms: Date.now() - dbStart,
      message: err.message,
      last_checked: new Date().toISOString(),
    });
  }

  if (!process.env.JSONCARGO_API_KEY) {
    services.push({ service: 'JSONCARGO', status: 'unhealthy', latency_ms: 0, message: 'JSONCARGO_API_KEY não configurada', last_checked: new Date().toISOString() });
  } else {
    services.push({ service: 'JSONCARGO', status: 'healthy', latency_ms: 0, message: 'API key configured', last_checked: new Date().toISOString() });
  }

  const resendStart = Date.now();
  if (!process.env.RESEND_API_KEY) {
    services.push({ service: 'Resend (Email)', status: 'unhealthy', latency_ms: 0, message: 'RESEND_API_KEY não configurada', last_checked: new Date().toISOString() });
  } else if (testEmail) {
    try {
      const response = await resend.emails.send({
        from: process.env.RESEND_FROM || 'CRONOS Health Check <alerts@hermes.z3us.ai>',
        to: [testEmail],
        subject: 'CRONOS Health Check - Email Service OK',
        html: '<p>Serviço de email operacional.</p>',
      });
      if (response?.error) throw new Error(response.error.message || 'Falha ao enviar e-mail de teste');
      services.push({ service: 'Resend (Email)', status: 'healthy', latency_ms: Date.now() - resendStart, message: `Test email sent to ${testEmail}`, last_checked: new Date().toISOString() });
    } catch (err) {
      services.push({ service: 'Resend (Email)', status: 'unhealthy', latency_ms: Date.now() - resendStart, message: err.message, last_checked: new Date().toISOString() });
    }
  } else {
    services.push({
      service: 'Resend (Email)',
      status: process.env.RESEND_API_KEY.startsWith('re_') ? 'healthy' : 'degraded',
      latency_ms: Date.now() - resendStart,
      message: process.env.RESEND_API_KEY.startsWith('re_') ? 'API key configured' : 'Invalid API key format',
      last_checked: new Date().toISOString(),
    });
  }

  const hasUnhealthy = services.some((s) => s.status === 'unhealthy');
  const hasDegraded = services.some((s) => s.status === 'degraded');
  return {
    status: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
    total_latency_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    services,
  };
}

// ─── Exportação das rotas ────────────────────────────────────────────────────

export function registerDemurrageRoutes(app, { resend }) {

  // GET /api/demurrage/containers
  app.get('/api/demurrage/containers', async (req, res) => {
    try {
      const { search, risk_status, cronos_status, cronos_status_list, cliente, armador,
              pre_invoice_status, dispute_status, audit_status, limit = 500 } = req.query;
      const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);

      let whereConditions = [
        'dc.active = 1',
        `LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')`,
        `EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)`,
      ];
      let params = [];

      if (search) {
        whereConditions.push('(dc.numero LIKE ? OR dc.mbl LIKE ? OR dc.cliente LIKE ? OR dc.armador LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (risk_status && risk_status !== 'all') {
        whereConditions.push('dc.risk_status = ?'); params.push(risk_status);
      }
      const csList = cronos_status_list
        ? (Array.isArray(cronos_status_list) ? cronos_status_list : [cronos_status_list])
        : null;
      if (csList && csList.length > 0) {
        whereConditions.push(`dc.cronos_status IN (${csList.map(() => '?').join(', ')})`);
        params.push(...csList);
      } else if (cronos_status && cronos_status !== 'all') {
        whereConditions.push('dc.cronos_status = ?'); params.push(cronos_status);
      }
      if (cliente) { whereConditions.push('dc.cliente = ?'); params.push(cliente); }
      if (armador) { whereConditions.push('dc.armador = ?'); params.push(armador); }
      if (pre_invoice_status && pre_invoice_status !== 'all') {
        whereConditions.push('dc.pre_invoice_status = ?'); params.push(pre_invoice_status);
      }
      if (dispute_status && dispute_status !== 'all') {
        whereConditions.push('dc.dispute_status = ?'); params.push(dispute_status);
      }
      if (audit_status && audit_status !== 'all') {
        whereConditions.push('dc.audit_status = ?'); params.push(audit_status);
      }

      const containers = await finQuery(`
        SELECT dc.*, dc.bl AS hbl
        FROM dados_dachser.t_dachser_demurrage_containers dc
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY dc.updated_at DESC
        LIMIT ?
      `, [...params, safeLimit]);

      if (containers && containers.length > 0) {
        const clientes = [...new Set(containers.map(c => c.cliente).filter(Boolean))];
        const partnerMap = {};
        if (clientes.length > 0) {
          try {
            const rows = await finQuery(
              `SELECT nome_cliente, dchr_customer_number FROM dados_dachser.t_clientes_base WHERE nome_cliente IN (${clientes.map(() => '?').join(',')})`,
              clientes
            );
            for (const r of (rows || [])) partnerMap[r.nome_cliente] = r.dchr_customer_number;
          } catch (e) { /* skip */ }
        }
        for (const c of containers) {
          c.partner_id = partnerMap[c.cliente] || null;
          c.pi_status_info = null; c.pi_misk = null; c.pi_othello_registro = null;
          c.pi_observacao = null; c.pi_exchange_rate = null;
        }
      }

      res.json({ success: true, data: containers || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/containers]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/containers/by-mbl
  app.get('/api/demurrage/containers/by-mbl', async (req, res) => {
    try {
      const { mbl, invoice_number } = req.query;
      if (!mbl) return res.status(400).json({ success: false, error: 'MBL is required' });

      const mblPrefix = String(mbl).trim().toUpperCase().slice(0, 4);
      const allowedPrefixes = ['HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU'];
      if (!allowedPrefixes.includes(mblPrefix)) {
        return res.json({ success: true, data: [] });
      }

      // Step 1: demurrage table
      let mblContainers = await finQuery(
        `SELECT dc.* FROM dados_dachser.t_dachser_demurrage_containers dc WHERE TRIM(UPPER(dc.mbl)) = TRIM(UPPER(?)) AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)`,
        [mbl]
      );

      // Step 2: fallback by invoice_number
      if ((!mblContainers || mblContainers.length === 0) && invoice_number) {
        mblContainers = await finQuery(
          `SELECT dc.* FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.pre_invoice_number = ?`,
          [invoice_number]
        );
      }

      // Step 3: reconstruct from t_sea_tracking_current
      if (!mblContainers || mblContainers.length === 0) {
        try {
          const trackingRows = await finQuery(`
            SELECT t.id, t.mbl_id as mbl, t.container as numero, t.shipping_line as armador,
              t.consignee as cliente, t.tipo_processo, t.origem as porto_origem, t.destino as porto_destino,
              t.navio, t.vessel_imo, t.eta, t.last_event, t.container_status,
              t.email_analista, t.email_cliente,
              NULL as booking, NULL as etd, NULL as eta_confirmado, NULL as voyage, NULL as status_armador
            FROM dados_dachser.t_sea_tracking_current t
            WHERE TRIM(UPPER(t.mbl_id)) = TRIM(UPPER(?))
              AND t.container IS NOT NULL AND t.container != ''
              AND UPPER(t.container) != 'PENDENTE' AND UPPER(t.container) != 'NAO_ENCONTRADO'
            ORDER BY t.id DESC`, [mbl]);

          if (trackingRows && trackingRows.length > 0) {
            mblContainers = [];
            for (const row of trackingRows) {
              const numero = (row.numero || '').trim();
              if (!numero) continue;
              let dischargeDate = null, gateOutDate = null, returnDate = null;
              try {
                const histRows = await finQuery(`
                  SELECT event_type, MIN(event_datetime) as event_datetime FROM (
                    SELECT 'discharge' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Discharged%' OR event_description = 'Discharge' OR event_description LIKE '%Unloaded from Vessel%' OR event_description LIKE '%Import Discharged%' OR event_description LIKE '%Descarga%')
                    UNION ALL
                    SELECT 'gate_out' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Gate out%' OR event_description LIKE '%Gate-out%' OR event_description = 'Import to consignee' OR event_description LIKE '%Saída%' OR event_description LIKE '%Saida%')
                    UNION ALL
                    SELECT 'return' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Empty%returned%' OR event_description LIKE '%Gate in%' OR event_description LIKE '%Devolução%' OR event_description LIKE '%Devolvido%' OR event_description LIKE '%Empty to shipper%')
                  ) AS events GROUP BY event_type`, [numero, numero, numero]);
                for (const h of (histRows || [])) {
                  if (!h.event_datetime) continue;
                  const ds = typeof h.event_datetime === 'string' ? h.event_datetime.split('T')[0] : h.event_datetime.toISOString().split('T')[0];
                  if (h.event_type === 'discharge') dischargeDate = ds;
                  else if (h.event_type === 'gate_out') gateOutDate = ds;
                  else if (h.event_type === 'return') returnDate = ds;
                }
              } catch (e) {}
              const etaDate = row.eta_confirmado || row.eta;
              const etaStr = etaDate ? (typeof etaDate === 'string' ? etaDate.split('T')[0] : etaDate.toISOString().split('T')[0]) : null;
              const etdStr = row.etd ? (typeof row.etd === 'string' ? row.etd.split('T')[0] : row.etd.toISOString().split('T')[0]) : null;
              const ftStartedAt = dischargeDate ? `${dischargeDate} 00:00:00` : (etaStr ? `${etaStr} 00:00:00` : null);
              mblContainers.push({
                id: row.id, numero, mbl: (row.mbl || '').trim(), booking: row.booking || null,
                cliente: row.cliente || null, armador: row.armador || null, tipo_processo: row.tipo_processo || null,
                porto_origem: row.porto_origem || null, porto_destino: row.porto_destino || null,
                navio: row.navio || null, vessel_imo: row.vessel_imo || null, voyage: row.voyage || null,
                etd: etdStr, eta: etaStr, last_event: row.last_event || null,
                container_status: row.container_status || null, status_armador: row.status_armador || null,
                cronos_status: null, email_analista: row.email_analista || null, email_cliente: row.email_cliente || null,
                tipo_conteiner: null, ft_started_at: ftStartedAt,
                ft_source: dischargeDate ? 'HISTORICAL' : (etaStr ? 'ETA' : null),
                data_atracacao: dischargeDate, data_gate_out: gateOutDate, data_devolucao: returnDate,
                mariadb_id: row.id, active: 1, partner_id: null, hbl: null, _source: 'tracking_fallback',
              });
            }
          }
        } catch (e) { console.error('[by-mbl] tracking fallback error:', e.message); }
      }

      // Step 3b: history discovery
      if (!mblContainers || mblContainers.length === 0) {
        try {
          const histDiscovery = await finQuery(`
            SELECT DISTINCT h.container, h.mbl_id,
              (SELECT h2.event_description FROM dados_dachser.t_sea_tracking_history h2 WHERE h2.container = h.container AND h2.mbl_id = h.mbl_id ORDER BY h2.event_datetime DESC LIMIT 1) as last_event
            FROM dados_dachser.t_sea_tracking_history h
            WHERE TRIM(UPPER(h.mbl_id)) = TRIM(UPPER(?)) AND h.container IS NOT NULL AND h.container != ''
            GROUP BY h.container, h.mbl_id`, [mbl]);
          if (histDiscovery && histDiscovery.length > 0) {
            mblContainers = [];
            for (const row of histDiscovery) {
              const numero = (row.container || '').trim();
              if (!numero) continue;
              let dischargeDate = null, gateOutDate = null, returnDate = null;
              try {
                const histRows = await finQuery(`
                  SELECT event_type, MIN(event_datetime) as event_datetime FROM (
                    SELECT 'discharge' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Discharged%' OR event_description = 'Discharge' OR event_description LIKE '%Unloaded from Vessel%' OR event_description LIKE '%Import Discharged%' OR event_description LIKE '%Descarga%')
                    UNION ALL
                    SELECT 'gate_out' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Gate out%' OR event_description LIKE '%Gate-out%' OR event_description = 'Import to consignee' OR event_description LIKE '%Saída%' OR event_description LIKE '%Saida%')
                    UNION ALL
                    SELECT 'return' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history WHERE container = ? AND (event_description LIKE '%Empty%returned%' OR event_description LIKE '%Gate in%' OR event_description LIKE '%Devolução%' OR event_description LIKE '%Devolvido%' OR event_description LIKE '%Empty to shipper%')
                  ) AS events GROUP BY event_type`, [numero, numero, numero]);
                for (const h of (histRows || [])) {
                  if (!h.event_datetime) continue;
                  const ds = typeof h.event_datetime === 'string' ? h.event_datetime.split('T')[0] : h.event_datetime.toISOString().split('T')[0];
                  if (h.event_type === 'discharge') dischargeDate = ds;
                  else if (h.event_type === 'gate_out') gateOutDate = ds;
                  else if (h.event_type === 'return') returnDate = ds;
                }
              } catch (e) {}
              mblContainers.push({
                id: `hist-${numero}`, numero, mbl: (row.mbl_id || mbl).trim(),
                booking: null, cliente: null, armador: null, tipo_processo: null,
                porto_origem: null, porto_destino: null, navio: null, vessel_imo: null, voyage: null,
                etd: null, eta: null, last_event: row.last_event || null, container_status: null,
                status_armador: null, cronos_status: null, email_analista: null, email_cliente: null,
                tipo_conteiner: null, ft_started_at: dischargeDate ? `${dischargeDate} 00:00:00` : null,
                ft_source: dischargeDate ? 'HISTORICAL' : null,
                data_atracacao: dischargeDate, data_gate_out: gateOutDate, data_devolucao: returnDate,
                mariadb_id: null, active: 1, partner_id: null, hbl: null, _source: 'history_fallback',
              });
            }
          }
        } catch (e) { console.error('[by-mbl] history discovery error:', e.message); }
      }

      // Step 4: synthetic from pre-invoice
      if ((!mblContainers || mblContainers.length === 0) && invoice_number) {
        try {
          const piRows = await finQuery(
            `SELECT client_name, vessel_name, voyage_number, origin_port, destination_port, total_usd, issue_date FROM dados_dachser.t_dachser_demurrage_pre_invoices WHERE invoice_number = ? LIMIT 1`,
            [invoice_number]
          );
          if (piRows && piRows.length > 0) {
            const pi = piRows[0];
            mblContainers = [{ id: `synth-${mbl}`, numero: '—', mbl, booking: null,
              cliente: pi.client_name || null, armador: null, tipo_processo: null,
              porto_origem: pi.origin_port || null, porto_destino: pi.destination_port || null,
              navio: pi.vessel_name || null, vessel_imo: null, voyage: pi.voyage_number || null,
              etd: null, eta: null, last_event: null, container_status: null, status_armador: null,
              cronos_status: null, email_analista: null, email_cliente: null, tipo_conteiner: null,
              ft_started_at: null, ft_source: null, data_atracacao: null, data_gate_out: null,
              data_devolucao: null, mariadb_id: null, active: 1, partner_id: null, hbl: null,
              _source: 'pre_invoice_only',
            }];
          }
        } catch (e) {}
      }

      // Enrich with partner_id and HBL
      if (mblContainers && mblContainers.length > 0) {
        const cliList = [...new Set(mblContainers.map(c => c.cliente).filter(Boolean))];
        const partnerMap = {};
        if (cliList.length > 0) {
          try {
            const rows = await finQuery(
              `SELECT nome_cliente, dchr_customer_number FROM dados_dachser.t_clientes_base WHERE nome_cliente IN (${cliList.map(() => '?').join(',')})`,
              cliList
            );
            for (const r of (rows || [])) partnerMap[r.nome_cliente] = r.dchr_customer_number;
          } catch (e) {}
        }
        let hbl = null;
        try {
          const smRows = await finQuery(`SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1`, [mbl]);
          if (smRows?.[0]?.hawb) hbl = smRows[0].hawb;
          else {
            const mdRows = await finQuery(`SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1`, [mbl]);
            if (mdRows?.[0]?.hawb) hbl = mdRows[0].hawb;
          }
        } catch (e) {}
        for (const c of mblContainers) {
          if (!c.partner_id) c.partner_id = partnerMap[c.cliente] || null;
          if (!c.hbl) c.hbl = hbl || null;
        }
      }

      res.json({ success: true, data: mblContainers || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/containers/by-mbl]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/stats
  app.get('/api/demurrage/stats', async (req, res) => {
    try {
      const rows = await finQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN cronos_status IN ('IN_TRANSIT', 'ARRIVED', 'PENDING') THEN 1 ELSE 0 END) as in_transit,
          SUM(CASE WHEN risk_status IN ('at_risk', 'critical', 'exceeded') THEN 1 ELSE 0 END) as at_risk,
          SUM(CASE WHEN cronos_status IN ('GATE_OUT', 'RETURNED') THEN 1 ELSE 0 END) as delivered,
          COALESCE(SUM(expected_cost_usd), 0) as total_demurrage_usd
        FROM dados_dachser.t_dachser_demurrage_containers dc
        WHERE active = 1
          AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')
          AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)
      `);
      const row = rows?.[0] || {};
      res.json({ success: true, data: {
        total: Number(row.total || 0), inTransit: Number(row.in_transit || 0),
        atRisk: Number(row.at_risk || 0), delivered: Number(row.delivered || 0),
        totalDemurrageUsd: Number(row.total_demurrage_usd || 0),
      }});
    } catch (err) {
      console.error('[GET /api/demurrage/stats]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/containers/:id
  app.patch('/api/demurrage/containers/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { updates } = req.body;
      if (!id || !updates) return res.status(400).json({ error: 'id e updates são obrigatórios' });
      const allowedFields = [
        'notes', 'pre_invoice_number', 'pre_invoice_status', 'pre_invoice_total_usd',
        'disputed_amount_usd', 'recovered_amount_usd', 'dispute_status', 'dispute_reason',
        'armador_invoice_number', 'armador_cost_usd', 'armador_days_charged', 'audit_status', 'discrepancy_usd',
        'client_auto_alert', 'client_alert_days_before', 'client_report_frequency',
        'ft_started_at', 'data_devolucao', 'free_time_days'
      ];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_containers SET ${setClauses.join(', ')} WHERE id = ?`, [...values, id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/containers/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/rates
  app.get('/api/demurrage/rates', async (req, res) => {
    try {
      const rows = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_rates WHERE active = 1 ORDER BY created_at DESC, armador ASC, container_type ASC`);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/rates]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/rates
  app.post('/api/demurrage/rates', async (req, res) => {
    try {
      const { armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day } = req.body;
      if (!armador || !container_type || rate_usd === undefined)
        return res.status(400).json({ error: 'armador, container_type e rate_usd são obrigatórios' });
      await finQuery(
        `INSERT INTO dados_dachser.t_dachser_demurrage_rates (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [armador, container_type, free_time_days || 14, rate_usd, period_type || 'standard', period_start_day || null, period_end_day || null]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/demurrage/rates]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/rates/:id
  app.patch('/api/demurrage/rates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body.updates || req.body;
      if (!id) return res.status(400).json({ error: 'rate_id é obrigatório' });
      const allowedFields = ['armador', 'container_type', 'free_time_days', 'rate_usd', 'period_type', 'period_start_day', 'period_end_day', 'active'];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_rates SET ${setClauses.join(', ')} WHERE id = ?`, [...values, id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/rates/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/demurrage/rates/:id
  app.delete('/api/demurrage/rates/:id', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'rate_id é obrigatório' });
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_rates SET active = 0, updated_at = NOW() WHERE id = ?`, [id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/demurrage/rates/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/rates/bulk
  app.post('/api/demurrage/rates/bulk', async (req, res) => {
    try {
      const { rates } = req.body;
      if (!rates || rates.length === 0) return res.status(400).json({ error: 'rates array é obrigatório' });
      let insertedCount = 0;
      for (const rate of rates) {
        try {
          await finQuery(
            `INSERT INTO dados_dachser.t_dachser_demurrage_rates (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [rate.armador, rate.container_type, rate.free_time_days, rate.rate_usd, rate.period_type || 'STANDARD', rate.period_start_day || null, rate.period_end_day || null]
          );
          insertedCount++;
        } catch (e) { console.error('Error inserting rate:', e.message); }
      }
      res.json({ success: true, inserted: insertedCount, total: rates.length });
    } catch (err) {
      console.error('[POST /api/demurrage/rates/bulk]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/containers/:id/events
  app.get('/api/demurrage/containers/:id/events', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;
      let containerNumber;
      if (/^\d+$/.test(String(id))) {
        const cr = await finQuery('SELECT numero FROM dados_dachser.t_dachser_demurrage_containers WHERE id = ? LIMIT 1', [id]);
        containerNumber = cr?.[0]?.numero;
      } else {
        containerNumber = id;
      }
      if (!containerNumber) return res.json({ success: true, data: [] });
      const rows = await finQuery(`
        SELECT id, mbl_id, container, event_code, event_description, event_datetime, location,
               vessel_name, voyage, container_status, eta, source, created_at
        FROM dados_dachser.t_sea_tracking_history
        WHERE container = ?
        ORDER BY event_datetime DESC, created_at DESC
        LIMIT ?
      `, [containerNumber, Number(limit)]);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/containers/:id/events]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/containers/:id/events
  app.post('/api/demurrage/containers/:id/events', async (req, res) => {
    try {
      const { id } = req.params;
      const evtData = req.body;
      await finQuery(`
        INSERT INTO dados_dachser.t_dachser_demurrage_container_events
          (container_id, container_number, event_type, event_code, event_description, event_datetime, location, vessel_name, voyage_number, terminal, source, raw_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, evtData.container_number || null, evtData.event_type || null, evtData.event_code || null,
        evtData.event_description || null, evtData.event_datetime || null, evtData.location || null,
        evtData.vessel_name || null, evtData.voyage_number || null, evtData.terminal || null,
        evtData.source || 'MANUAL', evtData.raw_data ? JSON.stringify(evtData.raw_data) : null
      ]);
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/demurrage/containers/:id/events]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/settings
  app.get('/api/demurrage/settings', async (req, res) => {
    try {
      const rows = await finQuery(`SELECT setting_key, setting_value, description FROM dados_dachser.t_dachser_demurrage_settings`);
      const settingsMap = {};
      for (const s of (rows || [])) settingsMap[s.setting_key] = s.setting_value;
      res.json({ success: true, data: settingsMap });
    } catch (err) {
      console.error('[GET /api/demurrage/settings]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/settings/:key
  app.patch('/api/demurrage/settings/:key', async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (!key || value === undefined) return res.status(400).json({ error: 'key e value são obrigatórios' });
      await finQuery(
        `INSERT INTO dados_dachser.t_dachser_demurrage_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
        [key, value, value]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/settings/:key]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/clients
  app.get('/api/demurrage/clients', async (req, res) => {
    try {
      const rows = await finQuery(`
        SELECT DISTINCT cliente, COUNT(*) as total_containers, SUM(expected_cost_usd) as total_demurrage
        FROM dados_dachser.t_dachser_demurrage_containers dc
        WHERE active = 1 AND cliente IS NOT NULL AND cliente != ''
          AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')
          AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)
        GROUP BY cliente ORDER BY cliente ASC
      `);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/clients]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/armadores
  app.get('/api/demurrage/armadores', async (req, res) => {
    try {
      const rows = await finQuery(`
        SELECT DISTINCT armador, COUNT(*) as total_containers
        FROM dados_dachser.t_dachser_demurrage_containers dc
        WHERE active = 1 AND armador IS NOT NULL AND armador != ''
          AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')
          AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)
        GROUP BY armador ORDER BY armador ASC
      `);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/armadores]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/client-profiles
  app.get('/api/demurrage/client-profiles', async (req, res) => {
    try {
      const rows = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_client_profiles ORDER BY cliente ASC`);
      const parsed = (rows || []).map(p => ({ ...p, contact_emails: p.contact_emails ? JSON.parse(p.contact_emails) : [] }));
      res.json({ success: true, data: parsed });
    } catch (err) {
      console.error('[GET /api/demurrage/client-profiles]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/client-profiles
  app.post('/api/demurrage/client-profiles', async (req, res) => {
    try {
      const { cliente, auto_alert_enabled, alert_days_before, report_frequency, contact_emails } = req.body;
      if (!cliente) return res.status(400).json({ error: 'cliente é obrigatório' });
      const existing = await finQuery(`SELECT id FROM dados_dachser.t_dachser_demurrage_client_profiles WHERE cliente = ?`, [cliente]);
      if (existing && existing.length > 0) return res.status(400).json({ error: 'Perfil já existe para este cliente' });
      await finQuery(
        `INSERT INTO dados_dachser.t_dachser_demurrage_client_profiles (cliente, auto_alert_enabled, alert_days_before, report_frequency, contact_emails) VALUES (?, ?, ?, ?, ?)`,
        [cliente, auto_alert_enabled ? 1 : 0, alert_days_before || 3, report_frequency || 'WEEKLY', JSON.stringify(contact_emails || [])]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[POST /api/demurrage/client-profiles]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/client-profiles/:cliente
  app.patch('/api/demurrage/client-profiles/:cliente', async (req, res) => {
    try {
      const cliente = decodeURIComponent(req.params.cliente);
      const updates = req.body.updates || req.body;
      if (!cliente || !updates) return res.status(400).json({ error: 'cliente e updates são obrigatórios' });
      const allowedFields = ['auto_alert_enabled', 'alert_days_before', 'report_frequency', 'contact_emails'];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          setClauses.push(`${key} = ?`);
          if (key === 'contact_emails') values.push(JSON.stringify(value));
          else if (key === 'auto_alert_enabled') values.push(value ? 1 : 0);
          else values.push(value);
        }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_client_profiles SET ${setClauses.join(', ')} WHERE cliente = ?`, [...values, cliente]);
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/client-profiles/:cliente]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/demurrage/client-profiles/:cliente
  app.delete('/api/demurrage/client-profiles/:cliente', async (req, res) => {
    try {
      const cliente = decodeURIComponent(req.params.cliente);
      if (!cliente) return res.status(400).json({ error: 'cliente é obrigatório' });
      await finQuery(`DELETE FROM dados_dachser.t_dachser_demurrage_client_profiles WHERE cliente = ?`, [cliente]);
      res.json({ success: true });
    } catch (err) {
      console.error('[DELETE /api/demurrage/client-profiles/:cliente]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/pre-invoices
  app.get('/api/demurrage/pre-invoices', async (req, res) => {
    try {
      const { status, workflow_status, client_name, limit = 100 } = req.query;
      let whereConditions = [];
      let params = [];
      if (status && status !== 'all') { whereConditions.push('status = ?'); params.push(status); }
      if (workflow_status && workflow_status !== 'all') { whereConditions.push('workflow_status = ?'); params.push(workflow_status); }
      if (client_name) { whereConditions.push('client_name LIKE ?'); params.push(`%${client_name}%`); }
      whereConditions.push(`LEFT(UPPER(TRIM(dados_dachser.t_dachser_demurrage_pre_invoices.shipment_mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')`);
      whereConditions.push(`EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dados_dachser.t_dachser_demurrage_pre_invoices.shipment_mbl)) COLLATE utf8mb4_unicode_ci)`);
      const piWhere = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const preInvoices = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoices ${piWhere} ORDER BY created_at DESC LIMIT ?`, [...params, Number(limit)]);
      if (preInvoices && preInvoices.length > 0) {
        const mbls = [...new Set(preInvoices.map(pi => pi.shipment_mbl).filter(Boolean))];
        const hblMap = {};
        if (mbls.length > 0) {
          try {
            const smRows = await finQuery(`SELECT master, hawb FROM dados_dachser.t_sea_master WHERE master IN (${mbls.map(() => '?').join(',')})`, mbls);
            for (const r of (smRows || [])) { if (r.hawb && !hblMap[r.master]) hblMap[r.master] = r.hawb; }
            const missing = mbls.filter(m => !hblMap[m]);
            if (missing.length > 0) {
              const mdRows = await finQuery(`SELECT mawb, hawb FROM dados_dachser.t_master_dados WHERE mawb IN (${missing.map(() => '?').join(',')})`, missing);
              for (const r of (mdRows || [])) { if (r.hawb && !hblMap[r.mawb]) hblMap[r.mawb] = r.hawb; }
            }
          } catch (e) {}
          for (const pi of preInvoices) pi.hbl = hblMap[pi.shipment_mbl] || null;
        }
      }
      res.json({ success: true, data: preInvoices || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/pre-invoices]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/pre-invoices
  app.post('/api/demurrage/pre-invoices', async (req, res) => {
    try {
      const d = req.body;
      if (!d.invoice_number) return res.status(400).json({ error: 'invoice_number é obrigatório' });
      await finQuery(`
        INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoices
          (invoice_number, shipment_mbl, client_name, bl_number, vessel_name, voyage_number,
           origin_port, destination_port, arrival_date, issue_date, due_date,
           total_usd, total_brl, exchange_rate, status, workflow_status, financial_status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        d.invoice_number, d.shipment_mbl || null, d.client_name || null, d.bl_number || null,
        d.vessel_name || null, d.voyage_number || null, d.origin_port || null, d.destination_port || null,
        d.arrival_date || null, d.issue_date || null, d.due_date || null,
        d.total_usd || 0, d.total_brl || 0, d.exchange_rate || 6.16,
        d.status || 'pending', d.workflow_status || 'calculated', d.financial_status || 'PENDING',
        d.notes || null, d.created_by || null
      ]);
      const lastId = await finQuery('SELECT LAST_INSERT_ID() as id');
      res.json({ success: true, id: lastId?.[0]?.id });
    } catch (err) {
      console.error('[POST /api/demurrage/pre-invoices]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/pre-invoices/:id
  app.patch('/api/demurrage/pre-invoices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body.updates || req.body;
      if (!id || !updates) return res.status(400).json({ error: 'id e updates são obrigatórios' });
      const allowedFields = [
        'shipment_mbl', 'client_name', 'bl_number', 'vessel_name', 'voyage_number',
        'origin_port', 'destination_port', 'arrival_date', 'issue_date', 'due_date',
        'total_usd', 'total_brl', 'exchange_rate', 'status', 'workflow_status', 'financial_status',
        'notes', 'posted_at', 'status_info', 'misk', 'observacao', 'othello_registro', 'alert_sent_at', 'contestacao_deadline'
      ];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_pre_invoices SET ${setClauses.join(', ')} WHERE id = ?`, [...values, id]);
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/pre-invoices/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/pre-invoices/:id/items
  app.get('/api/demurrage/pre-invoices/:id/items', async (req, res) => {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'pre_invoice_id é obrigatório' });
      const rows = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_pre_invoice_items WHERE pre_invoice_id = ? ORDER BY container_number ASC`, [id]);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/pre-invoices/:id/items]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/alerts
  app.get('/api/demurrage/alerts', async (req, res) => {
    try {
      const { container_id, status, limit = 100 } = req.query;
      let conditions = [];
      let params = [];
      if (container_id) { conditions.push('container_id = ?'); params.push(container_id); }
      if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
      conditions.push(`EXISTS (SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.id = dados_dachser.t_dachser_demurrage_alerts.container_id AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU') AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci))`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_alerts ${where} ORDER BY sent_at DESC LIMIT ?`, [...params, Number(limit)]);
      const parsed = (rows || []).map(a => ({ ...a, recipient_emails: a.recipient_emails ? JSON.parse(a.recipient_emails) : [] }));
      res.json({ success: true, data: parsed });
    } catch (err) {
      console.error('[GET /api/demurrage/alerts]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/alerts/:id/returned
  app.patch('/api/demurrage/alerts/:id/returned', async (req, res) => {
    try {
      const { id } = req.params;
      const { user_name } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      await finQuery(
        `UPDATE dados_dachser.t_dachser_demurrage_alerts SET client_returned = 1, client_returned_at = NOW(), client_returned_by = ? WHERE id = ?`,
        [user_name || 'sistema', id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/alerts/:id/returned]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/disputes
  app.get('/api/demurrage/disputes', async (req, res) => {
    try {
      const { container_id, status, client_name, limit = 100 } = req.query;
      let conditions = [];
      let params = [];
      if (container_id) { conditions.push('container_id = ?'); params.push(container_id); }
      if (status && status !== 'all') { conditions.push('status = ?'); params.push(status); }
      if (client_name) { conditions.push('client_name LIKE ?'); params.push(`%${client_name}%`); }
      conditions.push(`EXISTS (SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc WHERE dc.id = dados_dachser.t_dachser_demurrage_disputes.container_id AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU') AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci))`);
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await finQuery(`SELECT * FROM dados_dachser.t_dachser_demurrage_disputes ${where} ORDER BY opened_at DESC LIMIT ?`, [...params, Number(limit)]);
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/disputes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/disputes
  app.post('/api/demurrage/disputes', async (req, res) => {
    try {
      const d = req.body;
      if (!d.container_id) return res.status(400).json({ error: 'container_id é obrigatório' });
      await finQuery(`
        INSERT INTO dados_dachser.t_dachser_demurrage_disputes
          (container_id, container_number, client_name, armador, status, disputed_amount_usd, reason, success_probability, opened_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [d.container_id, d.container_number || null, d.client_name || null, d.armador || null,
          d.status || 'opened', d.disputed_amount_usd || 0, d.reason || null,
          d.success_probability || 50, d.opened_by || null]);
      await finQuery(
        `UPDATE dados_dachser.t_dachser_demurrage_containers SET dispute_status = 'opened', disputed_amount_usd = ?, updated_at = NOW() WHERE id = ?`,
        [d.disputed_amount_usd || 0, d.container_id]
      );
      const lastId = await finQuery('SELECT LAST_INSERT_ID() as id');
      res.json({ success: true, id: lastId?.[0]?.id });
    } catch (err) {
      console.error('[POST /api/demurrage/disputes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/demurrage/disputes/:id
  app.patch('/api/demurrage/disputes/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body.updates || req.body;
      if (!id || !updates) return res.status(400).json({ error: 'id e updates são obrigatórios' });
      const allowedFields = ['status', 'disputed_amount_usd', 'recovered_amount_usd', 'reason', 'success_probability', 'resolution_notes', 'resolved_by', 'resolved_at'];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_disputes SET ${setClauses.join(', ')} WHERE id = ?`, [...values, id]);
      if (updates.status === 'won' || updates.status === 'lost') {
        const dispInfo = await finQuery('SELECT container_id FROM dados_dachser.t_dachser_demurrage_disputes WHERE id = ?', [id]);
        if (dispInfo?.[0]) {
          await finQuery(
            `UPDATE dados_dachser.t_dachser_demurrage_containers SET dispute_status = ?, recovered_amount_usd = ?, updated_at = NOW() WHERE id = ?`,
            [updates.status, updates.recovered_amount_usd || 0, dispInfo[0].container_id]
          );
        }
      }
      res.json({ success: true });
    } catch (err) {
      console.error('[PATCH /api/demurrage/disputes/:id]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/containers/bulk-update
  app.post('/api/demurrage/containers/bulk-update', async (req, res) => {
    try {
      const { container_ids, updates } = req.body;
      if (!container_ids || container_ids.length === 0 || !updates)
        return res.status(400).json({ error: 'container_ids e updates são obrigatórios' });
      const allowedFields = [
        'notes', 'pre_invoice_number', 'pre_invoice_status', 'pre_invoice_total_usd',
        'disputed_amount_usd', 'recovered_amount_usd', 'dispute_status', 'dispute_reason',
        'armador_invoice_number', 'armador_cost_usd', 'armador_days_charged', 'audit_status', 'discrepancy_usd',
        'client_auto_alert', 'client_alert_days_before', 'client_report_frequency',
        'ft_started_at', 'data_devolucao', 'free_time_days'
      ];
      const setClauses = [], values = [];
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) { setClauses.push(`${key} = ?`); values.push(value); }
      }
      if (setClauses.length === 0) return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      setClauses.push('updated_at = NOW()');
      const placeholders = container_ids.map(() => '?').join(', ');
      await finQuery(`UPDATE dados_dachser.t_dachser_demurrage_containers SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`, [...values, ...container_ids]);
      res.json({ success: true, updated: container_ids.length });
    } catch (err) {
      console.error('[POST /api/demurrage/containers/bulk-update]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/sync
  app.post('/api/demurrage/sync', async (req, res) => {
    try {
      const syncResults = { total_records: 0, created: 0, updated: 0, errors: 0, error_details: [] };

      const sourceRows = await finQuery(`
        SELECT t.id, t.mbl_id, t.tipo_processo, t.container, t.shipping_line, t.consignee,
               t.origem, t.destino, t.navio, t.vessel_imo, t.eta, t.last_event,
               t.container_status, t.email_analista, t.email_cliente, t.active
        FROM dados_dachser.t_sea_tracking_current t
        WHERE t.active = 1 AND t.container IS NOT NULL AND t.container != ''
          AND UPPER(t.container) NOT IN ('PENDENTE', 'NAO_ENCONTRADO')
          AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NOT FOUND%')
          AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NAO_ENCONTRADO%')
          AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%PREFIX NOT FOUND%')
          AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%NOT FOUND%')
        ORDER BY t.id DESC LIMIT 2000
      `);

      syncResults.total_records = sourceRows.length;

      function mapCronosStatus(lastEvent, statusArmador, containerStatus) {
        const ev = (lastEvent || '').toLowerCase(), st = (statusArmador || '').toLowerCase(), cs = (containerStatus || '').toLowerCase();
        if (ev.includes('return') || ev.includes('devol') || st.includes('return') || cs.includes('return') || ev.includes('empty') || cs.includes('empty')) return 'RETURNED';
        if (ev.includes('gate out') || ev.includes('gateout') || ev.includes('saída') || ev.includes('saida') || st.includes('gate out') || cs.includes('gate-out')) return 'GATE_OUT';
        if (ev.includes('arrived') || ev.includes('discharged') || ev.includes('atracado') || ev.includes('descarregado') || ev.includes('arrival') || cs.includes('discharged')) return 'ARRIVED';
        if (ev.includes('transit') || ev.includes('departed') || ev.includes('em trânsito') || ev.includes('embarcado') || ev.includes('loaded') || ev.includes('sailing')) return 'IN_TRANSIT';
        return 'PENDING';
      }
      function fmtDate(d) {
        if (!d) return null;
        if (typeof d === 'string') return d.split('T')[0];
        try { return d.toISOString().split('T')[0]; } catch { return null; }
      }
      function normalizeCarrier(v) {
        if (!v) return null;
        const c = String(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (c.includes('HAPAG')) return 'HAPAG-LLOYD';
        if (c.includes('MEDITERRANEAN') || /\bMSC\b/.test(c)) return 'MSC';
        if (c.includes('CMA')) return 'CMA-CGM';
        if (c.includes('ZIM')) return 'ZIM';
        if (c.includes('MAERSK')) return 'MAERSK';
        if (c.includes('HMM') || c.includes('HYUNDAI')) return 'HMM';
        if (c.includes('OCEAN NETWORK') || /\bONE\b/.test(c)) return 'ONE';
        if (c.includes('COSCO')) return 'COSCO';
        return String(v).trim().toUpperCase();
      }
      function inferTipoProcesso(t, origem, destino) {
        if (t && t.trim()) return t;
        const o = String(origem || '').toUpperCase(), d = String(destino || '').toUpperCase();
        const isBR = (s) => /\bBR\b/.test(s) || s.includes('BRAZIL') || s.includes('BRASIL') || /\b(SANTOS|ITAJAI|ITAPOA|PARANAGUA|RIO GRANDE|MANAUS|SUAPE|SALVADOR|NAVEGANTES|PECEM|VITORIA|RIO DE JANEIRO|SAO FRANCISCO DO SUL)\b/.test(s);
        if (isBR(d) && !isBR(o)) return 'SEA IMPORT';
        if (isBR(o) && !isBR(d)) return 'SEA EXPORT';
        return 'SEA IMPORT';
      }
      const hblCache = new Map();
      async function fetchHbl(mbl) {
        if (hblCache.has(mbl)) return hblCache.get(mbl) || null;
        let hbl = null;
        try {
          const rows = await finQuery(`SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1`, [mbl]);
          if (rows?.[0]?.hawb) hbl = rows[0].hawb;
          else {
            const md = await finQuery(`SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1`, [mbl]);
            if (md?.[0]?.hawb) hbl = md[0].hawb;
          }
        } catch { }
        hblCache.set(mbl, hbl);
        return hbl;
      }

      for (const row of sourceRows) {
        try {
          if (!row.mbl_id || !row.container) continue;
          const numero = row.container.trim(), mbl = row.mbl_id.trim();
          const cronosStatus = mapCronosStatus(row.last_event, null, row.container_status);
          const eta = fmtDate(row.eta);
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          const armadorNorm = normalizeCarrier(row.shipping_line);
          const tipoProc = inferTipoProcesso(row.tipo_processo, row.origem, row.destino);
          const hbl = await fetchHbl(mbl);

          let discharge_date = null, gate_out_date = null, return_date = null;
          try {
            const histRows = await finQuery(`
              SELECT event_type, MIN(event_datetime) as event_datetime FROM (
                SELECT 'discharge' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Discharged%' OR event_description = 'Discharge' OR event_description LIKE '%Unloaded from Vessel%' OR event_description LIKE '%Import Discharged%' OR event_description LIKE '%Descarga%' OR event_description LIKE '%Descarregado%' OR event_description LIKE '%Vessel arrival%' OR event_description LIKE '%Vessel Arrival%' OR event_description LIKE '%Arrival at%' OR event_description = 'ATA' OR event_description LIKE 'Import%')
                UNION ALL
                SELECT 'gate_out' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Gate out%' OR event_description LIKE '%Gate-out%' OR event_description = 'Import to consignee' OR event_description LIKE '%Saída%' OR event_description LIKE '%Saida%')
                UNION ALL
                SELECT 'return' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Empty%returned%' OR event_description LIKE '%Empty container return%' OR event_description LIKE '%Empty container gate in%' OR event_description LIKE '%Empty in depot%' OR event_description LIKE '%Gate in empty%' OR event_description LIKE '%Empty return%' OR event_description LIKE '%Devolução%' OR event_description LIKE '%Devolvido%' OR event_description LIKE '%Empty to shipper%')
              ) AS events GROUP BY event_type
            `, [numero, numero, numero]);
            for (const hr of (histRows || [])) {
              if (hr.event_datetime) {
                const ds = fmtDate(hr.event_datetime);
                if (hr.event_type === 'discharge') discharge_date = ds;
                if (hr.event_type === 'gate_out') gate_out_date = ds;
                if (hr.event_type === 'return') return_date = ds;
              }
            }
          } catch { }

          const existing = await finQuery(`SELECT id, ft_started_at, data_atracacao, data_gate_out, data_devolucao, ft_source FROM dados_dachser.t_dachser_demurrage_containers WHERE numero = ? AND mbl = ? LIMIT 1`, [numero, mbl]);
          let ftStartedAt = existing?.[0]?.ft_started_at || null;
          let dataAtracacao = existing?.[0]?.data_atracacao || null;
          let dataGateOut = existing?.[0]?.data_gate_out || null;
          let dataDevolucao = existing?.[0]?.data_devolucao || null;
          let ftSource = existing?.[0]?.ft_source || null;

          if (!dataAtracacao) dataAtracacao = discharge_date;
          if (!ftStartedAt && discharge_date) { ftStartedAt = `${discharge_date} 00:00:00`; ftSource = 'HISTORICAL'; }
          if (!dataGateOut) dataGateOut = gate_out_date || (cronosStatus === 'GATE_OUT' ? now.split(' ')[0] : null);
          if (!dataDevolucao) dataDevolucao = return_date || (cronosStatus === 'RETURNED' ? now.split(' ')[0] : null);

          if (existing && existing.length > 0) {
            await finQuery(`
              UPDATE dados_dachser.t_dachser_demurrage_containers SET
                bl = COALESCE(?, bl), booking = ?, cliente = ?, armador = ?, tipo_processo = ?,
                porto_origem = ?, porto_destino = ?, navio = ?, vessel_imo = ?, voyage = ?,
                etd = ?, eta = ?, last_event = ?, container_status = ?, status_armador = ?, cronos_status = ?,
                email_analista = ?, email_cliente = ?,
                ft_started_at = CASE WHEN ? = 'HISTORICAL' THEN ? ELSE COALESCE(ft_started_at, ?) END,
                ft_source = COALESCE(?, ft_source),
                data_atracacao = CASE WHEN ? IS NOT NULL THEN ? ELSE COALESCE(data_atracacao, ?) END,
                data_gate_out = CASE WHEN ? IS NOT NULL THEN ? ELSE COALESCE(data_gate_out, ?) END,
                data_devolucao = CASE WHEN ? IS NOT NULL THEN ? ELSE COALESCE(data_devolucao, ?) END,
                mariadb_id = ?, last_sync_at = NOW(), updated_at = NOW()
              WHERE id = ?
            `, [
              hbl, null, row.consignee || null, armadorNorm, tipoProc,
              row.origem || null, row.destino || null, row.navio || null, row.vessel_imo || null, null,
              null, eta, row.last_event || null, row.container_status || null, null, cronosStatus,
              row.email_analista || null, row.email_cliente || null,
              ftSource, ftStartedAt, ftStartedAt, ftSource,
              discharge_date, dataAtracacao, dataAtracacao,
              gate_out_date, dataGateOut, dataGateOut,
              return_date, dataDevolucao, dataDevolucao,
              row.id, existing[0].id
            ]);
            syncResults.updated++;
          } else {
            await finQuery(`
              INSERT INTO dados_dachser.t_dachser_demurrage_containers
                (numero, mbl, bl, booking, cliente, armador, tipo_processo,
                 porto_origem, porto_destino, navio, vessel_imo, voyage,
                 etd, eta, last_event, container_status, status_armador, cronos_status,
                 email_analista, email_cliente,
                 ft_started_at, ft_source, data_atracacao, data_gate_out, data_devolucao,
                 mariadb_id, last_sync_at, active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
            `, [
              numero, mbl, hbl, null, row.consignee || null, armadorNorm, tipoProc,
              row.origem || null, row.destino || null, row.navio || null, row.vessel_imo || null, null,
              null, eta, row.last_event || null, row.container_status || null, null, cronosStatus,
              row.email_analista || null, row.email_cliente || null,
              ftStartedAt, ftSource, dataAtracacao, dataGateOut, dataDevolucao, row.id
            ]);
            syncResults.created++;
          }
        } catch (rowErr) {
          syncResults.errors++;
          syncResults.error_details.push(`${row.container}: ${rowErr.message}`);
        }
      }

      res.json({ success: true, message: 'Demurrage sync completed', results: syncResults });
    } catch (err) {
      console.error('[POST /api/demurrage/sync]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/import-from-tracking
  // Importa para demurrage os containers do tracking que ainda não estão cadastrados.
  // Body: { preview: boolean } — preview=true retorna a lista sem inserir.
  app.post('/api/demurrage/import-from-tracking', async (req, res) => {
    try {
      const { preview = false } = req.body || {};
      const ELIGIBLE_PREFIXES = ['HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU'];
      const placeholders = ELIGIBLE_PREFIXES.map(() => '?').join(',');

      const sourceRows = await finQuery(`
        SELECT t.id, t.mbl_id, t.tipo_processo, t.container, t.shipping_line, t.consignee,
               t.origem, t.destino, t.navio, t.vessel_imo, t.eta, t.last_event,
               t.container_status, t.email_analista, t.email_cliente
        FROM dados_dachser.t_sea_tracking_current t
        WHERE t.active = 1
          AND t.container IS NOT NULL AND t.container != ''
          AND UPPER(t.container) NOT IN ('PENDENTE', 'NAO_ENCONTRADO')
          AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NOT FOUND%')
          AND (t.container_status IS NULL OR UPPER(t.container_status) NOT LIKE '%NAO_ENCONTRADO%')
          AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%PREFIX NOT FOUND%')
          AND (t.last_event IS NULL OR UPPER(t.last_event) NOT LIKE '%NOT FOUND%')
          AND LEFT(UPPER(TRIM(t.mbl_id)), 4) IN (${placeholders})
          AND NOT EXISTS (
            SELECT 1 FROM dados_dachser.t_dachser_demurrage_containers dc
            WHERE UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(t.container)) COLLATE utf8mb4_unicode_ci
              AND UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(t.mbl_id)) COLLATE utf8mb4_unicode_ci
              AND dc.active = 1
          )
        ORDER BY t.id DESC LIMIT 500
      `, ELIGIBLE_PREFIXES);

      if (preview) {
        return res.json({
          success: true,
          preview: true,
          total: sourceRows.length,
          items: sourceRows.map(r => ({
            container: r.container,
            mbl: r.mbl_id,
            shipping_line: r.shipping_line,
            consignee: r.consignee,
            eta: r.eta ? (typeof r.eta === 'string' ? r.eta.split('T')[0] : r.eta.toISOString().split('T')[0]) : null,
            container_status: r.container_status,
            last_event: r.last_event,
          })),
        });
      }

      // --- helpers (mesma lógica do /sync) ---
      function iftMapCronosStatus(lastEvent, containerStatus) {
        const ev = (lastEvent || '').toLowerCase(), cs = (containerStatus || '').toLowerCase();
        if (ev.includes('return') || cs.includes('return') || ev.includes('empty') || cs.includes('empty')) return 'RETURNED';
        if (ev.includes('gate out') || ev.includes('gateout') || ev.includes('saída') || ev.includes('saida') || cs.includes('gate-out')) return 'GATE_OUT';
        if (ev.includes('arrived') || ev.includes('discharged') || ev.includes('atracado') || ev.includes('descarregado') || ev.includes('arrival') || cs.includes('discharged')) return 'ARRIVED';
        if (ev.includes('transit') || ev.includes('departed') || ev.includes('embarcado') || ev.includes('loaded') || ev.includes('sailing')) return 'IN_TRANSIT';
        return 'PENDING';
      }
      function iftFmtDate(d) {
        if (!d) return null;
        if (typeof d === 'string') return d.split('T')[0];
        try { return d.toISOString().split('T')[0]; } catch { return null; }
      }
      function iftNormalizeCarrier(v) {
        if (!v) return null;
        const c = String(v).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (c.includes('HAPAG')) return 'HAPAG-LLOYD';
        if (c.includes('MEDITERRANEAN') || /\bMSC\b/.test(c)) return 'MSC';
        if (c.includes('CMA')) return 'CMA-CGM';
        if (c.includes('ZIM')) return 'ZIM';
        if (c.includes('MAERSK')) return 'MAERSK';
        if (c.includes('HMM') || c.includes('HYUNDAI')) return 'HMM';
        if (c.includes('OCEAN NETWORK') || /\bONE\b/.test(c)) return 'ONE';
        if (c.includes('COSCO')) return 'COSCO';
        return String(v).trim().toUpperCase();
      }
      function iftInferTipoProcesso(t, origem, destino) {
        if (t && t.trim()) return t;
        const o = String(origem || '').toUpperCase(), d = String(destino || '').toUpperCase();
        const isBR = (s) => /\bBR\b/.test(s) || s.includes('BRAZIL') || s.includes('BRASIL') || /\b(SANTOS|ITAJAI|ITAPOA|PARANAGUA|RIO GRANDE|MANAUS|SUAPE|SALVADOR|NAVEGANTES|PECEM|VITORIA|RIO DE JANEIRO|SAO FRANCISCO DO SUL)\b/.test(s);
        if (isBR(d) && !isBR(o)) return 'SEA IMPORT';
        if (isBR(o) && !isBR(d)) return 'SEA EXPORT';
        return 'SEA IMPORT';
      }
      const hblCache = new Map();
      async function iftFetchHbl(mbl) {
        if (hblCache.has(mbl)) return hblCache.get(mbl) || null;
        let hbl = null;
        try {
          const rows = await finQuery(`SELECT hawb FROM dados_dachser.t_sea_master WHERE master = ? LIMIT 1`, [mbl]);
          if (rows?.[0]?.hawb) hbl = rows[0].hawb;
          else {
            const md = await finQuery(`SELECT hawb FROM dados_dachser.t_master_dados WHERE mawb = ? LIMIT 1`, [mbl]);
            if (md?.[0]?.hawb) hbl = md[0].hawb;
          }
        } catch { }
        hblCache.set(mbl, hbl);
        return hbl;
      }

      const results = { total: sourceRows.length, created: 0, errors: 0, error_details: [] };

      for (const row of sourceRows) {
        try {
          if (!row.mbl_id || !row.container) continue;
          const numero = row.container.trim(), mbl = row.mbl_id.trim();
          const cronosStatus = iftMapCronosStatus(row.last_event, row.container_status);
          const eta = iftFmtDate(row.eta);
          const armadorNorm = iftNormalizeCarrier(row.shipping_line);
          const tipoProc = iftInferTipoProcesso(row.tipo_processo, row.origem, row.destino);
          const hbl = await iftFetchHbl(mbl);

          let discharge_date = null, gate_out_date = null, return_date = null;
          try {
            const histRows = await finQuery(`
              SELECT event_type, MIN(event_datetime) as event_datetime FROM (
                SELECT 'discharge' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Discharged%' OR event_description = 'Discharge' OR event_description LIKE '%Unloaded from Vessel%' OR event_description LIKE '%Import Discharged%' OR event_description LIKE '%Descarga%' OR event_description LIKE '%Descarregado%' OR event_description LIKE '%Vessel arrival%' OR event_description LIKE '%Vessel Arrival%' OR event_description LIKE '%Arrival at%' OR event_description = 'ATA' OR event_description LIKE 'Import%')
                UNION ALL
                SELECT 'gate_out' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Gate out%' OR event_description LIKE '%Gate-out%' OR event_description = 'Import to consignee' OR event_description LIKE '%Saída%' OR event_description LIKE '%Saida%')
                UNION ALL
                SELECT 'return' as event_type, event_datetime FROM dados_dachser.t_sea_tracking_history
                WHERE container = ? AND (event_description LIKE '%Empty%returned%' OR event_description LIKE '%Empty container return%' OR event_description LIKE '%Empty container gate in%' OR event_description LIKE '%Empty in depot%' OR event_description LIKE '%Gate in empty%' OR event_description LIKE '%Empty return%' OR event_description LIKE '%Devolução%' OR event_description LIKE '%Devolvido%' OR event_description LIKE '%Empty to shipper%')
              ) AS events GROUP BY event_type
            `, [numero, numero, numero]);
            for (const hr of (histRows || [])) {
              if (hr.event_datetime) {
                const ds = iftFmtDate(hr.event_datetime);
                if (hr.event_type === 'discharge') discharge_date = ds;
                if (hr.event_type === 'gate_out') gate_out_date = ds;
                if (hr.event_type === 'return') return_date = ds;
              }
            }
          } catch { }

          let ftStartedAt = null, dataAtracacao = null, dataGateOut = null, dataDevolucao = null, ftSource = null;
          if (discharge_date) { ftStartedAt = `${discharge_date} 00:00:00`; ftSource = 'HISTORICAL'; dataAtracacao = discharge_date; }
          if (gate_out_date) dataGateOut = gate_out_date;
          if (return_date) dataDevolucao = return_date;

          await finQuery(`
            INSERT INTO dados_dachser.t_dachser_demurrage_containers
              (numero, mbl, bl, booking, cliente, armador, tipo_processo,
               porto_origem, porto_destino, navio, vessel_imo, voyage,
               etd, eta, last_event, container_status, status_armador, cronos_status,
               email_analista, email_cliente,
               ft_started_at, ft_source, data_atracacao, data_gate_out, data_devolucao,
               mariadb_id, last_sync_at, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)
          `, [
            numero, mbl, hbl, null, row.consignee || null, armadorNorm, tipoProc,
            row.origem || null, row.destino || null, row.navio || null, row.vessel_imo || null, null,
            null, eta, row.last_event || null, row.container_status || null, null, cronosStatus,
            row.email_analista || null, row.email_cliente || null,
            ftStartedAt, ftSource, dataAtracacao, dataGateOut, dataDevolucao, row.id
          ]);
          results.created++;
        } catch (rowErr) {
          results.errors++;
          results.error_details.push(`${row.container}: ${rowErr.message}`);
        }
      }

      res.json({ success: true, results });
    } catch (err) {
      console.error('[POST /api/demurrage/import-from-tracking]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/search-clientes
  app.get('/api/demurrage/search-clientes', async (req, res) => {
    try {
      const { search } = req.query;
      if (!search || String(search).length < 2) return res.json({ success: true, data: [] });
      const rows = await finQuery(
        `SELECT DISTINCT nome_cliente, dchr_customer_number, cnpj FROM dados_dachser.t_clientes_base WHERE nome_cliente LIKE ? ORDER BY nome_cliente ASC LIMIT 15`,
        [`%${search}%`]
      );
      res.json({ success: true, data: rows || [] });
    } catch (err) {
      console.error('[GET /api/demurrage/search-clientes]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/recalc
  app.post('/api/demurrage/recalc', async (req, res) => {
    try {
      const settingsRows = await finQuery(`SELECT setting_key, setting_value FROM dados_dachser.t_dachser_demurrage_settings`);
      const settings = {};
      for (const row of (settingsRows || [])) settings[row.setting_key] = row.setting_value;
      const defaultFreeTime = Number.parseInt(settings.default_free_time, 10) || 14;
      const defaultRate = Number.parseFloat(settings.default_rate) || 150;

      const rates = await finQuery(`
        SELECT armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day
        FROM dados_dachser.t_dachser_demurrage_rates
        WHERE active = 1
      `);
      const ratesMap = {};
      for (const rate of (rates || [])) {
        const key = `${rate.armador || 'DEFAULT'}:${rate.container_type || ''}`;
        if (!ratesMap[key]) ratesMap[key] = [];
        ratesMap[key].push(rate);
      }

      const freeTimes = await finQuery(`
        SELECT cliente_nome, tipo_ft, mbl, free_time_days, armador
        FROM dados_dachser.t_client_free_time
        WHERE ativo = TRUE
          AND (
            tipo_ft = 'PROCESSO'
            OR (tipo_ft = 'CONTRATO'
                AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE())
                AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE()))
          )
      `);
      const ftByMbl = new Map();
      const ftByCliente = new Map();
      for (const ft of (freeTimes || [])) {
        if (ft.tipo_ft === 'PROCESSO' && ft.mbl) ftByMbl.set(String(ft.mbl).toUpperCase(), ft);
        if (ft.tipo_ft === 'CONTRATO' && ft.cliente_nome) ftByCliente.set(String(ft.cliente_nome).toUpperCase(), ft);
      }

      const containers = await finQuery(`
        SELECT id, numero, mbl, cliente, armador, tipo_conteiner, ft_started_at, data_devolucao, free_time_days
        FROM dados_dachser.t_dachser_demurrage_containers
        WHERE active = 1 AND ft_started_at IS NOT NULL
      `);

      const results = { total: (containers || []).length, updated: 0, safe: 0, at_risk: 0, critical: 0, exceeded: 0, total_demurrage_usd: 0, errors: 0 };
      const now = new Date();

      for (const container of (containers || [])) {
        try {
          const ftStart = new Date(container.ft_started_at);
          if (Number.isNaN(ftStart.getTime())) continue;

          const endDate = container.data_devolucao ? new Date(container.data_devolucao) : now;
          const containerType = container.tipo_conteiner || '40DV';
          const armador = container.armador || 'DEFAULT';
          const applicableRates = ratesMap[`${armador}:${containerType}`] || ratesMap[`DEFAULT:${containerType}`] || [];

          let freeTimeDays = defaultFreeTime;
          let ftSource = 'DEFAULT';
          if (container.mbl && ftByMbl.has(String(container.mbl).toUpperCase())) {
            const ft = ftByMbl.get(String(container.mbl).toUpperCase());
            freeTimeDays = Number(ft.free_time_days) || defaultFreeTime;
            ftSource = 'PROCESSO';
          } else if (container.cliente && ftByCliente.has(String(container.cliente).toUpperCase())) {
            const ft = ftByCliente.get(String(container.cliente).toUpperCase());
            freeTimeDays = Number(ft.free_time_days) || defaultFreeTime;
            ftSource = 'CONTRATO';
          } else if (applicableRates.length > 0 && applicableRates[0].free_time_days) {
            freeTimeDays = Number(applicableRates[0].free_time_days) || defaultFreeTime;
            ftSource = 'TARIFA';
          } else if (container.free_time_days) {
            freeTimeDays = Number(container.free_time_days) || defaultFreeTime;
            ftSource = 'CONTAINER';
          }

          const freeTimeEnd = new Date(ftStart);
          freeTimeEnd.setDate(freeTimeEnd.getDate() + freeTimeDays);
          const totalDays = Math.floor((endDate.getTime() - ftStart.getTime()) / 86400000);
          const daysRemaining = Math.floor((freeTimeEnd.getTime() - now.getTime()) / 86400000);
          const daysExceeded = Math.max(0, totalDays - freeTimeDays);

          let demurrageCost = 0;
          let ratePerDay = defaultRate;
          if (daysExceeded > 0) {
            const sortedRates = applicableRates
              .filter((rate) => rate.period_type !== 'free_period')
              .sort((a, b) => Number(a.period_start_day || 0) - Number(b.period_start_day || 0));
            if (sortedRates.length > 0) {
              let remainingDays = daysExceeded;
              for (const rate of sortedRates) {
                if (remainingDays <= 0) break;
                const periodStart = Number(rate.period_start_day || 1);
                const periodEnd = Number(rate.period_end_day || remainingDays + periodStart - 1);
                const daysInPeriod = Math.min(remainingDays, Math.max(1, periodEnd - periodStart + 1));
                demurrageCost += daysInPeriod * Number(rate.rate_usd || 0);
                ratePerDay = Number(rate.rate_usd || ratePerDay);
                remainingDays -= daysInPeriod;
              }
              if (remainingDays > 0) demurrageCost += remainingDays * Number(sortedRates[sortedRates.length - 1].rate_usd || defaultRate);
            } else {
              demurrageCost = daysExceeded * defaultRate;
            }
          }

          let riskStatus;
          let riskScore;
          if (container.data_devolucao) {
            riskStatus = daysExceeded > 0 ? 'exceeded' : 'safe';
            riskScore = daysExceeded > 0 ? 100 : 0;
          } else if (daysRemaining > 5) {
            riskStatus = 'safe'; riskScore = 20; results.safe++;
          } else if (daysRemaining > 2) {
            riskStatus = 'at_risk'; riskScore = 50; results.at_risk++;
          } else if (daysRemaining > 0) {
            riskStatus = 'critical'; riskScore = 80; results.critical++;
          } else {
            riskStatus = 'exceeded'; riskScore = 100; results.exceeded++;
          }

          await finQuery(`
            UPDATE dados_dachser.t_dachser_demurrage_containers SET
              free_time_days = ?, free_time_end_date = ?, days_remaining = ?,
              excedente_dias = ?, expected_cost_usd = ?, rate_usd_per_day = ?,
              risk_status = ?, risk_score = ?, ft_source = ?, updated_at = NOW()
            WHERE id = ?
          `, [
            freeTimeDays, freeTimeEnd.toISOString().slice(0, 10), Math.max(0, daysRemaining),
            daysExceeded, demurrageCost, ratePerDay, riskStatus, riskScore, ftSource, container.id,
          ]);

          results.updated++;
          results.total_demurrage_usd += demurrageCost;
        } catch (containerErr) {
          console.error(`[POST /api/demurrage/recalc] container ${container.numero}:`, containerErr.message);
          results.errors++;
        }
      }

      res.json({ success: true, message: 'Demurrage recalculation completed', results });
    } catch (err) {
      console.error('[POST /api/demurrage/recalc]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/demurrage/send-alert
  app.post('/api/demurrage/send-alert', async (req, res) => {
    try {
      const body = req.body || {};
      const recipientEmails = Array.isArray(body.recipient_emails)
        ? body.recipient_emails.filter(Boolean)
        : [];
      if (recipientEmails.length === 0) {
        return res.status(400).json({ success: false, error: 'recipient_emails é obrigatório' });
      }

      const containers = Array.isArray(body.containers) ? body.containers : [];
      const subjectTarget = containers.length > 1
        ? `${containers.length} containers em acompanhamento`
        : `Container ${containers[0]?.number || body.container_number || body.house_bl || body.shipment_master || 'N/A'}`;
      const subject = `${body.test_mode ? '[TESTE] ' : ''}Demurrage - ${subjectTarget}`;
      const html = buildDemurrageAlertHtml({ ...body, containers });
      const from = process.env.RESEND_FROM || 'Dachser <alerts@hermes.z3us.ai>';

      let resendId = null;
      let sent = 0;
      if (process.env.RESEND_API_KEY) {
        const emailResponse = await resend.emails.send({ from, to: recipientEmails, subject, html });
        if (emailResponse?.error) throw new Error(emailResponse.error.message || 'Falha ao enviar e-mail pelo Resend');
        resendId = emailResponse?.data?.id || null;
        sent = recipientEmails.length;
      } else {
        console.warn('[POST /api/demurrage/send-alert] RESEND_API_KEY não configurada; e-mail não enviado.');
      }

      if (!body.test_mode) {
        const containerNumbers = [
          body.container_number,
          ...containers.map((c) => c.number || c.container_number),
        ].filter(Boolean);
        let idByNumber = new Map();
        if (containerNumbers.length > 0) {
          const uniqueNumbers = [...new Set(containerNumbers)];
          const rows = await finQuery(
            `SELECT id, numero FROM dados_dachser.t_dachser_demurrage_containers WHERE numero IN (${uniqueNumbers.map(() => '?').join(',')})`,
            uniqueNumbers
          );
          idByNumber = new Map((rows || []).map((row) => [row.numero, row.id]));
        }

        const historyTargets = containers.length > 0 ? containers : [{ number: body.container_number }];
        for (const c of historyTargets) {
          const containerNumber = c.number || c.container_number || body.container_number || null;
          const containerId = body.container_id || (containerNumber ? idByNumber.get(containerNumber) : null);
          if (!containerId) continue;
          await finQuery(`
            INSERT INTO dados_dachser.t_dachser_demurrage_alerts
              (container_id, container_number, alert_type, client_name, shipment_master, days_remaining, expected_cost_usd, recipient_emails, status, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            containerId, containerNumber, body.alert_type || 'cost_statement',
            body.client_name || null, body.shipment_master || null,
            body.days_remaining ?? c.days_remaining ?? null,
            body.expected_cost_usd ?? body.total_usd ?? c.total_usd ?? null,
            JSON.stringify(recipientEmails),
            process.env.RESEND_API_KEY ? 'sent' : 'logged',
            process.env.RESEND_API_KEY ? null : 'RESEND_API_KEY não configurada',
          ]);
        }
      }

      res.json({
        success: true,
        status: 'success',
        message: process.env.RESEND_API_KEY
          ? `Alert sent to ${recipientEmails.length} recipient(s)`
          : 'RESEND_API_KEY não configurada; alerta validado e registrado quando aplicável',
        sent,
        resendId,
      });
    } catch (err) {
      console.error('[POST /api/demurrage/send-alert]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/job-logs (stub)
  app.get('/api/demurrage/job-logs', async (req, res) => {
    try {
      res.json({ success: true, data: [] });
    } catch (err) {
      console.error('[GET /api/demurrage/job-logs]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/demurrage/health-check
  app.get('/api/demurrage/health-check', async (req, res) => {
    res.json(await buildDemurrageHealthCheck(resend, req.query.test_email));
  });

  // POST /api/demurrage/health-check
  app.post('/api/demurrage/health-check', async (req, res) => {
    res.json(await buildDemurrageHealthCheck(resend, req.body?.test_email));
  });

  // POST /api/demurrage/import-jsoncargo
  app.post('/api/demurrage/import-jsoncargo', async (req, res) => {
    try {
      const { mbls, shipping_line, organization_id, cliente } = req.body;
      if (!mbls || !Array.isArray(mbls) || mbls.length === 0) return res.status(400).json({ error: 'Nenhum MBL informado' });
      if (!shipping_line) return res.status(400).json({ error: 'Armador é obrigatório' });
      const JSONCARGO_API_KEY = process.env.JSONCARGO_API_KEY;
      if (!JSONCARGO_API_KEY) return res.status(500).json({ error: 'JSONCARGO_API_KEY não configurada' });

      const isValidContainer = (num) => /^[A-Z]{4}[0-9]{7}$/.test(String(num || '').toUpperCase().trim());
      const detectType = (t) => {
        if (!t) return 'DRY';
        const u = String(t).toUpperCase();
        if (u.includes('REEF') || u.includes('RF') || u.includes('REFRIGER')) return 'REEFER';
        if (u.includes('TANK')) return 'TANK';
        if (u.includes('FLAT') || u.includes('OPEN') || u.includes('OT') || u.includes('FR')) return 'SPECIAL';
        return 'DRY';
      };
      const parseDate = (d) => {
        if (!d) return null;
        try {
          if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.split(' ')[0];
          const dt = new Date(d);
          if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
        } catch { }
        return null;
      };

      const results = [], errors = [];
      for (const mbl of mbls) {
        const cleanMbl = String(mbl || '').trim();
        if (!cleanMbl) continue;
        try {
          const apiUrl = `http://api.jsoncargo.com/api/v1/containers/bol/${encodeURIComponent(cleanMbl)}?shipping_line=${encodeURIComponent(shipping_line)}`;
          const apiRes = await fetch(apiUrl, { headers: { 'x-api-key': JSONCARGO_API_KEY, 'Content-Type': 'application/json' } });
          if (!apiRes.ok) {
            const errorText = await apiRes.text();
            errors.push({ mbl: cleanMbl, error: `${apiRes.status} - ${errorText}`, carrier_tried: shipping_line });
            continue;
          }
          const apiData = await apiRes.json();
          const bolData = apiData.data || apiData;
          const containers = [];
          const rawContainers = bolData.associated_containers || bolData.associated_container_numbers || (bolData.container_number ? [bolData.container_number] : []);
          for (const c of rawContainers) {
            const rawNum = typeof c === 'object' ? (c.container_number || c) : c;
            const num = String(rawNum).toUpperCase().trim();
            containers.push({ numero: num, tipo_conteiner: detectType(typeof c === 'object' ? c.container_type : bolData.container_type), status: (typeof c === 'object' ? c.container_status : bolData.container_status) || 'IN_TRANSIT', is_valid_format: isValidContainer(num), raw_number: rawNum });
          }
          results.push({ mbl: bolData.bill_of_lading || cleanMbl, armador: bolData.shipping_line_name || shipping_line, porto_origem: bolData.shipped_from || null, porto_destino: bolData.shipped_to || null, expected_pod: bolData.shipped_to || null, data_atracacao: parseDate(bolData.eta_final_destination) || parseDate(bolData.atd_origin), containers, raw_data: bolData });
        } catch (e) {
          errors.push({ mbl: cleanMbl, error: e.message || 'Erro desconhecido', carrier_tried: shipping_line });
        }
      }
      res.json({ status: 'success', total_requested: mbls.length, total_found: results.length, total_errors: errors.length, shipments: results, errors, cliente_sugerido: cliente || null, carrier_used: shipping_line });
    } catch (err) {
      console.error('[POST /api/demurrage/import-jsoncargo]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

}
