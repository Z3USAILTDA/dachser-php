// Batch 6C — HAM/Germany routes + ONEY (19 MBLs)
// v1
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const results: any[] = [];
  try {
    const mysql = await import("npm:mysql2@3.11.3/promise");
    const conn = await mysql.createConnection({
      host: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      user: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      database: 'dados_dachser',
      connectTimeout: 10000,
    });

    const ins = async (mbl: string, ctr: string, code: string, desc: string, dt: string, loc: string, vessel: string, voyage: string) => {
      await conn.execute(
        `INSERT IGNORE INTO dados_dachser.t_tracking_sea_history (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, source, created_at) VALUES (?,?,?,?,?,?,?,?,'MANUAL',NOW())`,
        [mbl, ctr, code, desc, dt, loc, vessel, voyage]
      );
    };
    const upd = async (mbl: string, data: Record<string, any>) => {
      const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const vals = [...Object.values(data), mbl];
      await conn.execute(`UPDATE dados_dachser.t_tracking_sea SET ${sets}, updated_at = NOW() WHERE mbl_id = ?`, vals);
    };
    const del = async (mbl: string) => {
      await conn.execute(`DELETE FROM dados_dachser.t_tracking_sea_history WHERE mbl_id = ?`, [mbl]);
    };

    console.log('[batch6c] Starting...');

    // HLCUHAM2511ATSA8
    await upd('HLCUHAM2511ATSA8', { container: 'HLBU2813832', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2511ATSA8');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','GOE','Gate out empty','2025-12-18 09:34:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','ARR','Arrival in','2025-12-18 14:13:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','DEP','Departure from','2025-12-19 00:13:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','ARR','Arrival in','2025-12-19 11:22:00','HAMBURG','Rail','');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','CRG','Loaded','2025-12-30 16:02:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','DEP','Vessel departed','2025-12-30 22:30:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','ARR','Vessel arrived','2026-02-06 18:42:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','DCH','Discharged','2026-02-06 21:42:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','DEP','Departure from','2026-02-24 21:35:00','RIO GRANDE','Truck','');
    await ins('HLCUHAM2511ATSA8','HLBU2813832','GIE','Gate in empty','2026-02-26 12:00:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2511ATSA8', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATSA8', status: 'ok', events: 10 });

    // HLCUHAM2511ATSF3
    await upd('HLCUHAM2511ATSF3', { container: 'FANU3399776', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2511ATSF3');
    await ins('HLCUHAM2511ATSF3','FANU3399776','GOE','Gate out empty','2025-12-18 07:27:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2511ATSF3','FANU3399776','ARR','Arrival in','2025-12-18 12:27:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSF3','FANU3399776','DEP','Departure from','2025-12-19 00:13:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSF3','FANU3399776','ARR','Arrival in','2025-12-19 14:29:00','HAMBURG','Rail','');
    await ins('HLCUHAM2511ATSF3','FANU3399776','CRG','Loaded','2025-12-30 16:01:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSF3','FANU3399776','DEP','Vessel departed','2025-12-30 22:30:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSF3','FANU3399776','ARR','Vessel arrived','2026-02-06 18:42:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSF3','FANU3399776','DCH','Discharged','2026-02-06 21:45:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSF3','FANU3399776','DEP','Departure from','2026-03-03 21:27:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2511ATSF3', { last_event: 'Departure from - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DEP' });
    results.push({ mbl: 'HLCUHAM2511ATSF3', status: 'ok', events: 9 });

    // HLCUHAM2511ATSK8
    await upd('HLCUHAM2511ATSK8', { container: 'HAMU1807075', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2511ATSK8');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','GOE','Gate out empty','2025-12-18 11:33:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','ARR','Arrival in','2025-12-18 16:52:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','DEP','Departure from','2025-12-19 00:13:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','ARR','Arrival in','2025-12-19 11:23:00','HAMBURG','Rail','');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','CRG','Loaded','2025-12-30 15:47:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','DEP','Vessel departed','2025-12-30 22:30:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','ARR','Vessel arrived','2026-02-06 18:42:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','DCH','Discharged','2026-02-06 20:46:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','DEP','Departure from','2026-02-27 23:27:00','RIO GRANDE','Truck','');
    await ins('HLCUHAM2511ATSK8','HAMU1807075','GIE','Gate in empty','2026-03-03 09:02:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2511ATSK8', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATSK8', status: 'ok', events: 10 });

    // HLCUHAM2511ATUC1
    await upd('HLCUHAM2511ATUC1', { container: 'HAMU3590250', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2511ATUC1');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','GOE','Gate out empty','2025-12-17 17:13:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','ARR','Arrival in','2025-12-18 11:40:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','DEP','Departure from','2025-12-19 00:13:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','ARR','Arrival in','2025-12-19 11:23:00','HAMBURG','Rail','');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','CRG','Loaded','2025-12-30 15:54:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','DEP','Vessel departed','2025-12-30 22:30:00','HAMBURG','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','ARR','Vessel arrived','2026-02-06 18:42:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','DCH','Discharged','2026-02-06 20:52:00','RIO GRANDE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','DEP','Departure from','2026-02-13 21:33:00','RIO GRANDE','Truck','');
    await ins('HLCUHAM2511ATUC1','HAMU3590250','GIE','Gate in empty','2026-02-18 12:00:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2511ATUC1', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATUC1', status: 'ok', events: 10 });

    // HLCUHAM2511AUCB0
    await upd('HLCUHAM2511AUCB0', { container: 'FFAU5456505', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2511AUCB0');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','GOE','Gate out empty','2026-01-09 14:49:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','ARR','Arrival in','2026-01-12 14:02:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','DEP','Departure from','2026-01-14 15:30:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','ARR','Arrival in','2026-01-15 11:50:00','HAMBURG','Rail','');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','CRG','Loaded','2026-01-17 05:06:00','HAMBURG','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','DEP','Vessel departed','2026-01-17 09:28:00','HAMBURG','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','ARR','Vessel arrived','2026-02-22 21:00:00','RIO GRANDE','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','DCH','Discharged','2026-02-23 07:02:00','RIO GRANDE','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','DEP','Departure from','2026-03-05 21:18:00','RIO GRANDE','Truck','');
    await ins('HLCUHAM2511AUCB0','FFAU5456505','GIE','Gate in empty','2026-03-09 16:12:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2511AUCB0', { last_event: 'Gate in empty - RIO GRANDE', navio: 'XIAMEN EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511AUCB0', status: 'ok', events: 10 });

    // HLCUHAM2511BFSV1
    await upd('HLCUHAM2511BFSV1', { container: 'HLBU3777935', origem: 'MANNHEIM', destino: 'PARANAGUA' });
    await del('HLCUHAM2511BFSV1');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','GOE','Gate out empty','2025-12-05 13:11:00','MANNHEIM','Truck','');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','ARR','Arrival in','2025-12-09 21:55:00','ROTTERDAM','Rail','');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','CRG','Loaded','2025-12-19 11:02:00','ROTTERDAM','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','DEP','Vessel departed','2025-12-20 02:00:00','ROTTERDAM','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','ARR','Vessel arrived','2026-01-27 22:58:00','PARANAGUA','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','DCH','Discharged','2026-01-28 11:35:00','PARANAGUA','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','DEP','Departure from','2026-02-02 16:39:00','PARANAGUA','Truck','');
    await ins('HLCUHAM2511BFSV1','HLBU3777935','GIE','Gate in empty','2026-02-05 16:44:00','PARANAGUA','Truck','');
    await upd('HLCUHAM2511BFSV1', { last_event: 'Gate in empty - PARANAGUA', navio: 'MSC LEILA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BFSV1', status: 'ok', events: 8 });

    // HLCUHAM2511BJAG8
    await upd('HLCUHAM2511BJAG8', { container: 'HAMU1133790', origem: 'LUDWIGSHAFEN', destino: 'PARANAGUA' });
    await del('HLCUHAM2511BJAG8');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','GOE','Gate out empty','2025-12-17 16:47:00','LUDWIGSHAFEN','Truck','');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','ARR','Arrival in','2025-12-23 20:42:00','ROTTERDAM','Rail','');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','CRG','Loaded','2025-12-31 07:04:00','ROTTERDAM','MSC MUGE','NA552A');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','DEP','Vessel departed','2025-12-31 12:43:00','ROTTERDAM','MSC MUGE','NA552A');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','ARR','Vessel arrived','2026-02-19 10:27:00','PARANAGUA','MSC MUGE','NA552A');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','DCH','Discharged','2026-02-20 00:46:00','PARANAGUA','MSC MUGE','NA552A');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','DEP','Departure from','2026-03-03 17:36:00','PARANAGUA','Truck','');
    await ins('HLCUHAM2511BJAG8','HAMU1133790','GIE','Gate in empty','2026-03-05 18:10:00','PARANAGUA','Truck','');
    await upd('HLCUHAM2511BJAG8', { last_event: 'Gate in empty - PARANAGUA', navio: 'MSC MUGE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BJAG8', status: 'ok', events: 8 });

    // HLCUHAM2511BKFF2
    await upd('HLCUHAM2511BKFF2', { container: 'FCIU7099723', origem: 'BASLE', destino: 'SANTOS' });
    await del('HLCUHAM2511BKFF2');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','GOE','Gate out empty','2025-12-02 12:20:00','BASLE','Truck','');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','ARR','Arrival in','2025-12-08 21:51:00','ROTTERDAM','Rail','');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','CRG','Loaded','2025-12-19 02:56:00','ROTTERDAM','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','DEP','Vessel departed','2025-12-20 02:00:00','ROTTERDAM','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','ARR','Vessel arrived','2026-01-16 23:41:00','SANTOS','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','DCH','Discharged','2026-01-17 09:21:00','SANTOS','MSC LEILA','NA550A');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','DEP','Departure from','2026-01-17 13:46:00','SANTOS','Truck','');
    await ins('HLCUHAM2511BKFF2','FCIU7099723','GIE','Gate in empty','2026-01-30 13:41:00','SANTOS','Truck','');
    await upd('HLCUHAM2511BKFF2', { last_event: 'Gate in empty - SANTOS', navio: 'MSC LEILA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BKFF2', status: 'ok', events: 8 });

    // HLCUHAM251297195
    await upd('HLCUHAM251297195', { container: 'HLBU1518600', origem: 'DUISBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM251297195');
    await ins('HLCUHAM251297195','HLBU1518600','GOE','Gate out empty','2026-01-07 07:29:00','DUISBURG','Truck','');
    await ins('HLCUHAM251297195','HLBU1518600','ARR','Arrival in','2026-01-12 11:13:00','ANTWERP','Waterway','');
    await ins('HLCUHAM251297195','HLBU1518600','CRG','Loaded','2026-01-19 11:39:00','ANTWERP','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM251297195','HLBU1518600','DEP','Vessel departed','2026-01-19 19:04:00','ANTWERP','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM251297195','HLBU1518600','ARR','Vessel arrived','2026-02-22 21:00:00','RIO GRANDE','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM251297195','HLBU1518600','DCH','Discharged','2026-02-23 07:34:00','RIO GRANDE','XIAMEN EXPRESS','NA601A');
    await ins('HLCUHAM251297195','HLBU1518600','DEP','Departure from','2026-03-04 20:22:00','RIO GRANDE','Truck','');
    await ins('HLCUHAM251297195','HLBU1518600','GIE','Gate in empty','2026-03-06 08:50:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM251297195', { last_event: 'Gate in empty - RIO GRANDE', navio: 'XIAMEN EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM251297195', status: 'ok', events: 8 });

    console.log('[batch6c] HLCU HAM done');

    // ========================
    // ONEY — Empty Container Returned (DLV)
    // ========================
    const oneyDlv = [
      { mbl: 'ONEYHAMF95967300', ctr: 'FDCU0480240', dt: '2026-02-11 14:23:00', loc: 'ITAJAI' },
      { mbl: 'ONEYHAMF95967301', ctr: 'ONEU1754906', dt: '2026-02-10 09:52:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA1465500', ctr: 'ONEU1066776', dt: '2026-01-22 06:53:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA1479300', ctr: 'KKFU8036219', dt: '2026-01-21 07:27:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA1482400', ctr: 'ONEU6544501', dt: '2026-01-22 08:10:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA1484600', ctr: 'TLLU5513548', dt: '2026-01-21 07:32:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA1791700', ctr: 'FSCU8616368', dt: '2026-01-22 07:48:00', loc: 'N/A' },
      { mbl: 'ONEYHAMFA6038600', ctr: 'TRHU7336742', dt: '2026-02-05 10:11:00', loc: 'N/A' },
      { mbl: 'ONEYMEXG00992700', ctr: 'ONEU1106858', dt: '2026-03-06 12:24:00', loc: 'N/A' },
    ];
    for (const item of oneyDlv) {
      await upd(item.mbl, { container: item.ctr, container_status: 'DLV', last_event: `Empty Container Returned - ${item.loc}` });
      await del(item.mbl);
      await ins(item.mbl, item.ctr, 'GIE', 'Empty Container Returned from Customer', item.dt, item.loc, '', '');
      results.push({ mbl: item.mbl, status: 'ok', info: 'oney_dlv' });
    }

    // ONEYSAOG05421700 — com eventos
    await upd('ONEYSAOG05421700', { container: 'SEGU4975077', origem: 'SANTOS', destino: 'ANTWERP', eta: '2026-03-27' });
    await del('ONEYSAOG05421700');
    await ins('ONEYSAOG05421700','SEGU4975077','GOE','Empty Container Release to Shipper','2026-02-07 10:26:00','SANTOS','','');
    await ins('ONEYSAOG05421700','SEGU4975077','ARR','Gate In to Outbound Terminal','2026-02-25 17:02:00','SANTOS','','');
    await ins('ONEYSAOG05421700','SEGU4975077','CRG','Loaded on Vessel at Port of Loading','2026-02-28 10:07:00','SANTOS','XIN CHANG SHA','411N');
    await ins('ONEYSAOG05421700','SEGU4975077','DEP','Vessel Departure from Port of Loading','2026-02-28 10:07:00','SANTOS','XIN CHANG SHA','411N');
    await upd('ONEYSAOG05421700', { last_event: 'Vessel departed - SANTOS', navio: 'XIN CHANG SHA', container_status: 'DEP' });
    results.push({ mbl: 'ONEYSAOG05421700', status: 'ok', events: 4 });

    await conn.end();
    console.log('[batch6c] Done:', results.length, 'MBLs');
    return new Response(JSON.stringify({ success: true, batch: '6c', updated_count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error('[batch6c] Error:', e);
    return new Response(JSON.stringify({ error: e.message, partial_results: results }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
