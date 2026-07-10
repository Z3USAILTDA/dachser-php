import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('ops');
  try {
    console.log("--- QUERY FOR CHB RUN 225 ---");
    const [rows] = await pool.query("SELECT * FROM dados_dachser.t_chb_runs WHERE id = 225");
    console.log(JSON.stringify(rows[0], null, 2));

    console.log("\n--- TIME CHECKS ---");
    const [nowRows] = await pool.query("SELECT NOW(), UTC_TIMESTAMP(), @@session.time_zone, @@global.time_zone");
    console.log(nowRows[0]);
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    process.exit();
  }
}
test();
