import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('fin');
  
  const cronos_status_list = ['PENDING', 'IN_TRANSIT', 'ARRIVED']; // Mock what express receives for ?cronos_status_list=PENDING&...
  const csList = cronos_status_list ? (Array.isArray(cronos_status_list) ? cronos_status_list : [cronos_status_list]) : null;
  
  let whereConditions = [
    'dc.active = 1',
    `LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU')`,
    `EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)`,
  ];
  let params = [];

  if (csList && csList.length > 0) {
    whereConditions.push(`dc.cronos_status IN (${csList.map(() => '?').join(', ')})`);
    params.push(...csList);
  }

  const query = `
    SELECT dc.*, dc.bl AS hbl
    FROM dados_dachser.t_dachser_demurrage_containers dc
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY dc.updated_at DESC
    LIMIT ?
  `;
  params.push(500);

  try {
    const [rows] = await pool.query(query, params);
    console.log('SUCCESS:', rows.length, 'rows');
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    process.exit();
  }
}

test();
