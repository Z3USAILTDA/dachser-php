import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('ops');
  try {
    console.log("--- COLUMNS FOR dados_dachser.t_chb_runs ---");
    const [cols] = await pool.query("SHOW COLUMNS FROM dados_dachser.t_chb_runs");
    for (const col of cols) {
      console.log(`${col.Field} | ${col.Type} | Null: ${col.Null} | Key: ${col.Key} | Default: ${col.Default}`);
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    process.exit();
  }
}
test();
