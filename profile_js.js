import 'dotenv/config';
import { getPoolFor, queryWithRetry } from './server/db/pools.js';

const ETD_CUTOFF = process.env.AIR_ETD_CUTOFF || '2026-06-01';

async function profile() {
  console.time('DB Queries');
  const sql = `select * from dados_dachser.t_fato_aereo limit 1000`; // dummy
  // I will just copy the entire `computeTrackingData` from air.js here to measure it!
}

profile().catch(console.error);
