import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('fin');
  const query = `
    SELECT dc.*, dc.bl AS hbl
    FROM dados_dachser.t_dachser_demurrage_containers dc
    WHERE dc.active = 1 
      AND LEFT(UPPER(TRIM(dc.mbl)),4) IN ('HLCU','MEDU','ONEY','COSU','ZIMU','MAEU','SUDU','CMAU','EISU','YMLU','HDMU','PCIU','WHLU') 
      AND EXISTS (SELECT 1 FROM dados_dachser.t_sea_tracking_current tc WHERE UPPER(TRIM(tc.container)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.numero)) COLLATE utf8mb4_unicode_ci OR UPPER(TRIM(tc.mbl_id)) COLLATE utf8mb4_unicode_ci = UPPER(TRIM(dc.mbl)) COLLATE utf8mb4_unicode_ci)
    ORDER BY dc.updated_at DESC
    LIMIT 500
  `;
  try {
    const [rows] = await pool.query(query);
    console.log('SUCCESS:', rows.length, 'rows');
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    process.exit();
  }
}

test();
