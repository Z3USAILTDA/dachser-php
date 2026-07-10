import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('ops');
  try {
    console.log("--- QUERY FOR CHB RUN 222 ---");
    const [rows] = await pool.query("SELECT * FROM dados_dachser.t_chb_runs WHERE id = 222");
    if (rows.length === 0) {
      console.log("No run found with ID 222.");
    } else {
      console.log(JSON.stringify(rows[0], null, 2));
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    process.exit();
  }
}
test();
