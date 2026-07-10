import 'dotenv/config';
import { getPoolFor } from './server/db/pools.js';

async function test() {
  const pool = getPoolFor('ops');
  try {
    console.log("--- COLUMNS FOR dados_dachser.t_sea_runs ---");
    const [colsRuns] = await pool.query("SHOW COLUMNS FROM dados_dachser.t_sea_runs");
    for (const col of colsRuns) {
      console.log(`${col.Field} | ${col.Type} | Null: ${col.Null} | Key: ${col.Key} | Default: ${col.Default}`);
    }

    console.log("\n--- COLUMNS FOR dados_dachser.t_sea_items ---");
    const [colsItems] = await pool.query("SHOW COLUMNS FROM dados_dachser.t_sea_items");
    for (const col of colsItems) {
      console.log(`${col.Field} | ${col.Type} | Null: ${col.Null} | Key: ${col.Key} | Default: ${col.Default}`);
    }
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    process.exit();
  }
}
test();
