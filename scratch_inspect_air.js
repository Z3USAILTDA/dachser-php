import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('air');
  try {
    const [rows] = await pool.query(
      "SELECT * FROM dados_dachser.t_awb_rule_row WHERE matrix_id = 35 AND cnpj = ?",
      ['89637490013638']
    );
    console.log(`Found rules in matrix 35 for CNPJ 89637490013638:`, rows.length);
    for (const r of rows) {
      console.log(`Rule ID: ${r.id} | Airport: ${r.airport_code} | Address: ${r.address_pattern}`);
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    process.exit();
  }
}
test();
