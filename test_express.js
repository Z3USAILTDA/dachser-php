import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

const finQuery = async (sql, params = []) => {
  const db = getPoolFor('fin');
  const [rows] = await db.query(sql, params);
  return rows;
};

async function testRoute(reqQuery) {
  try {
    const { search, risk_status, cronos_status, cronos_status_list, cliente, armador, pre_invoice_status, dispute_status, audit_status, limit = 500 } = reqQuery;
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

    return { success: true, count: containers.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function run() {
  console.log('Testing {}...');
  console.log(await testRoute({}));

  console.log("Testing {'1': ''} ...");
  console.log(await testRoute({'1': ''}));

  console.log("Testing {cronos_status_list: ['PENDING', 'IN_TRANSIT']}...");
  console.log(await testRoute({ cronos_status_list: ['PENDING', 'IN_TRANSIT'] }));

  console.log("Testing {cronos_status_list: 'PENDING'}...");
  console.log(await testRoute({ cronos_status_list: 'PENDING' }));

  process.exit(0);
}

run();
