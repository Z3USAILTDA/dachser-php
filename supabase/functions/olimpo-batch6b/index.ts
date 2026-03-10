// Batch 6B — HLCU international routes (19 MBLs)
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

    console.log('[batch6b] Starting...');

    // HLCUVL1260106197
    await upd('HLCUVL1260106197', { container: 'UETU2724780', origem: 'VALENCIA', destino: 'PARANAGUA' });
    await del('HLCUVL1260106197');
    await ins('HLCUVL1260106197','UETU2724780','GOE','Gate out empty','2026-01-20 15:59:00','VALENCIA','Truck','');
    await ins('HLCUVL1260106197','UETU2724780','ARR','Arrival in','2026-01-21 13:00:00','VALENCIA','Truck','');
    await ins('HLCUVL1260106197','UETU2724780','CRG','Loaded','2026-02-03 11:41:00','VALENCIA','COPIAPO','MM604A');
    await ins('HLCUVL1260106197','UETU2724780','DEP','Vessel departed','2026-02-03 22:53:00','VALENCIA','COPIAPO','MM604A');
    await ins('HLCUVL1260106197','UETU2724780','ARR','Vessel arrived','2026-02-20 18:07:00','PARANAGUA','COPIAPO','MM604A');
    await ins('HLCUVL1260106197','UETU2724780','DCH','Discharged','2026-02-21 02:17:00','PARANAGUA','COPIAPO','MM604A');
    await ins('HLCUVL1260106197','UETU2724780','DEP','Departure from','2026-02-25 21:16:00','PARANAGUA','Truck','');
    await ins('HLCUVL1260106197','UETU2724780','GIE','Gate in empty','2026-02-27 09:49:00','PARANAGUA','Truck','');
    await upd('HLCUVL1260106197', { last_event: 'Gate in empty - PARANAGUA', navio: 'COPIAPO', container_status: 'DLV' });
    results.push({ mbl: 'HLCUVL1260106197', status: 'ok', events: 8 });

    // HLCUBKK260144990
    await upd('HLCUBKK260144990', { container: 'LYGU8074553', origem: 'BANG PHLI', destino: 'SANTOS', eta: '2026-03-29' });
    await del('HLCUBKK260144990');
    await ins('HLCUBKK260144990','LYGU8074553','GOE','Gate out empty','2026-01-24 10:34:00','BANG PHLI','Truck','');
    await ins('HLCUBKK260144990','LYGU8074553','ARR','Arrival in','2026-01-24 20:51:00','LAT KRABANG','Truck','');
    await ins('HLCUBKK260144990','LYGU8074553','DEP','Departure from','2026-01-25 22:13:00','LAT KRABANG','Truck','');
    await ins('HLCUBKK260144990','LYGU8074553','ARR','Arrival in','2026-01-28 04:25:00','LAEM CHABANG','Truck','');
    await ins('HLCUBKK260144990','LYGU8074553','CRG','Loaded','2026-02-05 21:31:00','LAEM CHABANG','KOTA LAMBANG','606E');
    await ins('HLCUBKK260144990','LYGU8074553','DEP','Vessel departed','2026-02-06 13:42:00','LAEM CHABANG','KOTA LAMBANG','606E');
    await ins('HLCUBKK260144990','LYGU8074553','ARR','Vessel arrived','2026-02-10 08:27:00','YANTIAN','KOTA LAMBANG','606E');
    await ins('HLCUBKK260144990','LYGU8074553','DCH','Discharged','2026-02-11 15:52:00','YANTIAN','KOTA LAMBANG','606E');
    await ins('HLCUBKK260144990','LYGU8074553','CRG','Loaded','2026-03-03 11:29:00','YANTIAN','ZIM BANGKOK','014W');
    await ins('HLCUBKK260144990','LYGU8074553','DEP','Vessel departed','2026-03-03 20:35:00','YANTIAN','ZIM BANGKOK','014W');
    await upd('HLCUBKK260144990', { last_event: 'Vessel departed - YANTIAN', navio: 'ZIM BANGKOK', container_status: 'DEP' });
    results.push({ mbl: 'HLCUBKK260144990', status: 'ok', events: 10 });

    // HLCUHAM2512AVRE3
    await upd('HLCUHAM2512AVRE3', { container: 'BMOU6536163', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await del('HLCUHAM2512AVRE3');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','GOE','Gate out empty','2026-01-15 16:09:00','LUDWIGSBURG','Truck','');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','ARR','Arrival in','2026-01-16 13:10:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','DEP','Departure from','2026-01-17 18:47:00','LUDWIGSBURG','Rail','');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','ARR','Arrival in','2026-01-20 03:52:00','HAMBURG','Rail','');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','CRG','Loaded','2026-01-25 08:40:00','HAMBURG','MSC INSA','NA603A');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','DEP','Vessel departed','2026-01-25 18:45:00','HAMBURG','MSC INSA','NA603A');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','ARR','Vessel arrived','2026-02-28 01:25:00','RIO GRANDE','MSC INSA','NA603A');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','DCH','Discharged','2026-02-28 04:42:00','RIO GRANDE','MSC INSA','NA603A');
    await ins('HLCUHAM2512AVRE3','BMOU6536163','DEP','Departure from','2026-03-06 20:27:00','RIO GRANDE','Truck','');
    await upd('HLCUHAM2512AVRE3', { last_event: 'Departure from - RIO GRANDE', navio: 'MSC INSA', container_status: 'DEP' });
    results.push({ mbl: 'HLCUHAM2512AVRE3', status: 'ok', events: 9 });

    // HLCUSS5251250005
    await upd('HLCUSS5251250005', { container: 'FFAU5216356', origem: 'SANTOS', destino: 'JOHANNESBURG' });
    await del('HLCUSS5251250005');
    await ins('HLCUSS5251250005','FFAU5216356','GOE','Gate out empty','2026-01-15 09:27:00','SANTOS','Truck','');
    await ins('HLCUSS5251250005','FFAU5216356','ARR','Arrival in','2026-01-22 07:35:00','SANTOS','Truck','');
    await ins('HLCUSS5251250005','FFAU5216356','CRG','Loaded','2026-01-24 21:58:00','SANTOS','NC BRUMA','022N');
    await ins('HLCUSS5251250005','FFAU5216356','DEP','Vessel departed','2026-01-25 10:30:00','SANTOS','NC BRUMA','022N');
    await ins('HLCUSS5251250005','FFAU5216356','ARR','Vessel arrived','2026-01-26 14:37:00','PARANAGUA','NC BRUMA','022N');
    await ins('HLCUSS5251250005','FFAU5216356','DCH','Discharged','2026-01-27 06:06:00','PARANAGUA','NC BRUMA','022N');
    await ins('HLCUSS5251250005','FFAU5216356','CRG','Loaded','2026-01-30 05:06:00','PARANAGUA','MIRADOR EXPRESS','2605E');
    await ins('HLCUSS5251250005','FFAU5216356','DEP','Vessel departed','2026-01-30 12:03:00','PARANAGUA','MIRADOR EXPRESS','2605E');
    await ins('HLCUSS5251250005','FFAU5216356','ARR','Vessel arrived','2026-02-15 17:27:00','DURBAN','MIRADOR EXPRESS','2605E');
    await ins('HLCUSS5251250005','FFAU5216356','DCH','Discharged','2026-02-16 13:14:00','DURBAN','MIRADOR EXPRESS','2605E');
    await ins('HLCUSS5251250005','FFAU5216356','DEP','Departure from','2026-02-19 09:54:00','DURBAN','Truck','');
    await ins('HLCUSS5251250005','FFAU5216356','GIE','Gate in empty','2026-02-23 13:36:00','JOHANNESBURG','Truck','');
    await upd('HLCUSS5251250005', { last_event: 'Gate in empty - JOHANNESBURG', navio: 'MIRADOR EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUSS5251250005', status: 'ok', events: 12 });

    // HLCULE1251217669
    await upd('HLCULE1251217669', { container: 'HLXU3744733', origem: 'LE HAVRE', destino: 'PARANAGUA' });
    await del('HLCULE1251217669');
    await ins('HLCULE1251217669','HLXU3744733','GOE','Gate out empty','2025-12-30 19:38:00','LE HAVRE','Truck','');
    await ins('HLCULE1251217669','HLXU3744733','ARR','Arrival in','2025-12-31 11:53:00','LE HAVRE','Truck','');
    await ins('HLCULE1251217669','HLXU3744733','CRG','Loaded','2026-01-10 08:13:00','LE HAVRE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCULE1251217669','HLXU3744733','DEP','Vessel departed','2026-01-10 18:15:00','LE HAVRE','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCULE1251217669','HLXU3744733','ARR','Vessel arrived','2026-02-10 09:15:00','PARANAGUA','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCULE1251217669','HLXU3744733','DCH','Discharged','2026-02-10 18:45:00','PARANAGUA','LAEM CHABANG EXPRESS','NA551A');
    await ins('HLCULE1251217669','HLXU3744733','DEP','Departure from','2026-02-12 05:34:00','PARANAGUA','Truck','');
    await ins('HLCULE1251217669','HLXU3744733','GIE','Gate in empty','2026-02-12 14:15:00','PARANAGUA','Truck','');
    await upd('HLCULE1251217669', { last_event: 'Gate in empty - PARANAGUA', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCULE1251217669', status: 'ok', events: 8 });

    // HLCUBC1251263706
    await upd('HLCUBC1251263706', { container: 'TDSU1048004', origem: 'BARCELONA', destino: 'SANTOS' });
    await del('HLCUBC1251263706');
    await ins('HLCUBC1251263706','TDSU1048004','GOE','Gate out empty','2026-01-23 08:40:00','BARCELONA','Truck','');
    await ins('HLCUBC1251263706','TDSU1048004','ARR','Arrival in','2026-01-23 13:21:00','BARCELONA','Truck','');
    await ins('HLCUBC1251263706','TDSU1048004','CRG','Loaded','2026-02-04 10:57:00','BARCELONA','CAPE AKRITAS','MC604A');
    await ins('HLCUBC1251263706','TDSU1048004','DEP','Vessel departed','2026-02-05 06:31:00','BARCELONA','CAPE AKRITAS','MC604A');
    await ins('HLCUBC1251263706','TDSU1048004','ARR','Vessel arrived','2026-02-06 15:52:00','VALENCIA','CAPE AKRITAS','MC604A');
    await ins('HLCUBC1251263706','TDSU1048004','DCH','Discharged','2026-02-07 09:58:00','VALENCIA','CAPE AKRITAS','MC604A');
    await ins('HLCUBC1251263706','TDSU1048004','CRG','Loaded','2026-02-09 05:16:00','VALENCIA','MSC ANTIGUA','MM605A');
    await ins('HLCUBC1251263706','TDSU1048004','DEP','Vessel departed','2026-02-09 16:50:00','VALENCIA','MSC ANTIGUA','MM605A');
    await ins('HLCUBC1251263706','TDSU1048004','ARR','Vessel arrived','2026-02-24 14:05:00','SANTOS','MSC ANTIGUA','MM605A');
    await ins('HLCUBC1251263706','TDSU1048004','DCH','Discharged','2026-02-24 18:32:00','SANTOS','MSC ANTIGUA','MM605A');
    await ins('HLCUBC1251263706','TDSU1048004','DEP','Departure from','2026-03-04 12:01:00','SANTOS','Truck','');
    await ins('HLCUBC1251263706','TDSU1048004','GIE','Gate in empty','2026-03-04 18:56:00','SANTOS','Rail','');
    await upd('HLCUBC1251263706', { last_event: 'Gate in empty - SANTOS', navio: 'MSC ANTIGUA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBC1251263706', status: 'ok', events: 12 });

    // HLCUBC1251213949
    await upd('HLCUBC1251213949', { container: 'GCXU2194037', origem: 'BARCELONA', destino: 'SANTOS' });
    await del('HLCUBC1251213949');
    await ins('HLCUBC1251213949','GCXU2194037','GOE','Gate out empty','2025-12-22 07:23:00','BARCELONA','Truck','');
    await ins('HLCUBC1251213949','GCXU2194037','ARR','Arrival in','2025-12-22 13:09:00','BARCELONA','Truck','');
    await ins('HLCUBC1251213949','GCXU2194037','CRG','Loaded','2025-12-29 00:04:00','BARCELONA','MSC AGADIR','MM552A');
    await ins('HLCUBC1251213949','GCXU2194037','DEP','Vessel departed','2025-12-29 08:11:00','BARCELONA','MSC AGADIR','MM552A');
    await ins('HLCUBC1251213949','GCXU2194037','ARR','Vessel arrived','2026-01-20 13:47:00','SANTOS','MSC AGADIR','MM552A');
    await ins('HLCUBC1251213949','GCXU2194037','DCH','Discharged','2026-01-20 20:25:00','SANTOS','MSC AGADIR','MM552A');
    await ins('HLCUBC1251213949','GCXU2194037','DEP','Departure from','2026-01-21 18:24:00','SANTOS','Truck','');
    await ins('HLCUBC1251213949','GCXU2194037','GIE','Gate in empty','2026-01-31 07:01:00','SANTOS','Truck','');
    await upd('HLCUBC1251213949', { last_event: 'Gate in empty - SANTOS', navio: 'MSC AGADIR', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBC1251213949', status: 'ok', events: 8 });

    // HLCUBSC251212360
    await upd('HLCUBSC251212360', { container: 'FANU3088183', origem: 'WORCESTER', destino: 'SANTOS' });
    await del('HLCUBSC251212360');
    await ins('HLCUBSC251212360','FANU3088183','GOE','Gate out empty','2025-12-30 07:45:00','WORCESTER','Truck','');
    await ins('HLCUBSC251212360','FANU3088183','ARR','Arrival in','2025-12-31 09:02:00','WORCESTER','Truck','');
    await ins('HLCUBSC251212360','FANU3088183','DEP','Departure from','2026-01-02 08:00:00','WORCESTER','Rail','');
    await ins('HLCUBSC251212360','FANU3088183','ARR','Arrival in','2026-01-10 06:52:00','PORT ELIZABETH','Rail','');
    await ins('HLCUBSC251212360','FANU3088183','DEP','Departure from','2026-01-10 08:46:00','PORT ELIZABETH','Truck','');
    await ins('HLCUBSC251212360','FANU3088183','ARR','Arrival in','2026-01-10 08:48:00','NEW YORK','Truck','');
    await ins('HLCUBSC251212360','FANU3088183','CRG','Loaded','2026-01-16 01:22:00','NEW YORK','MAERSK MONTE AZUL','603S');
    await ins('HLCUBSC251212360','FANU3088183','DEP','Vessel departed','2026-01-16 03:33:00','NEW YORK','MAERSK MONTE AZUL','603S');
    await ins('HLCUBSC251212360','FANU3088183','ARR','Vessel arrived','2026-02-11 03:30:00','SANTOS','MAERSK MONTE AZUL','603S');
    await ins('HLCUBSC251212360','FANU3088183','DCH','Discharged','2026-02-11 16:05:00','SANTOS','MAERSK MONTE AZUL','603S');
    await ins('HLCUBSC251212360','FANU3088183','DEP','Departure from','2026-02-12 12:51:00','SANTOS','Truck','');
    await ins('HLCUBSC251212360','FANU3088183','GIE','Gate in empty','2026-02-20 14:25:00','SANTOS','Truck','');
    await upd('HLCUBSC251212360', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK MONTE AZUL', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC251212360', status: 'ok', events: 12 });

    // HLCUBSC251286321
    await upd('HLCUBSC251286321', { container: 'CAIU6986670', origem: 'CHARLESTON', destino: 'SANTOS' });
    await del('HLCUBSC251286321');
    await ins('HLCUBSC251286321','CAIU6986670','GOE','Gate out empty','2026-01-07 07:08:00','CHARLESTON','Truck','');
    await ins('HLCUBSC251286321','CAIU6986670','ARR','Arrival in','2026-01-08 06:05:00','CHARLESTON','Truck','');
    await ins('HLCUBSC251286321','CAIU6986670','CRG','Loaded','2026-01-13 22:59:00','CHARLESTON','MAERSK FREEPORT','602S');
    await ins('HLCUBSC251286321','CAIU6986670','DEP','Vessel departed','2026-01-14 03:53:00','CHARLESTON','MAERSK FREEPORT','602S');
    await ins('HLCUBSC251286321','CAIU6986670','ARR','Vessel arrived','2026-02-03 02:41:00','SANTOS','MAERSK FREEPORT','602S');
    await ins('HLCUBSC251286321','CAIU6986670','DCH','Discharged','2026-02-03 07:30:00','SANTOS','MAERSK FREEPORT','602S');
    await ins('HLCUBSC251286321','CAIU6986670','DEP','Departure from','2026-02-05 01:16:00','SANTOS','Truck','');
    await ins('HLCUBSC251286321','CAIU6986670','GIE','Gate in empty','2026-02-13 10:37:00','SANTOS','Rail','');
    await upd('HLCUBSC251286321', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK FREEPORT', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC251286321', status: 'ok', events: 8 });

    // HLCUBSC2512BQWF4
    await upd('HLCUBSC2512BQWF4', { container: 'BSIU8284765', origem: 'CLEVELAND', destino: 'SANTOS' });
    await del('HLCUBSC2512BQWF4');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','GOE','Gate out empty','2025-12-16 11:45:00','CLEVELAND','Truck','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','ARR','Arrival in','2025-12-19 07:24:00','CLEVELAND','Truck','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','DEP','Departure from','2025-12-20 05:42:00','CLEVELAND','Rail','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','ARR','Arrival in','2025-12-23 20:16:00','PORT ELIZABETH','Rail','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','DEP','Departure from','2025-12-26 14:02:00','PORT ELIZABETH','Truck','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','ARR','Arrival in','2025-12-26 14:04:00','NEW YORK','Truck','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','CRG','Loaded','2026-01-05 16:13:00','NEW YORK','WIELAND','601S');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','DEP','Vessel departed','2026-01-06 06:51:00','NEW YORK','WIELAND','601S');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','ARR','Vessel arrived','2026-01-27 12:32:00','SANTOS','WIELAND','601S');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','DCH','Discharged','2026-01-28 07:44:00','SANTOS','WIELAND','601S');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','DEP','Departure from','2026-02-10 04:33:00','SANTOS','Truck','');
    await ins('HLCUBSC2512BQWF4','BSIU8284765','GIE','Gate in empty','2026-02-10 18:08:00','SANTOS','Truck','');
    await upd('HLCUBSC2512BQWF4', { last_event: 'Gate in empty - SANTOS', navio: 'WIELAND', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2512BQWF4', status: 'ok', events: 12 });

    // HLCUBSC2512BXZT6 (same container)
    await upd('HLCUBSC2512BXZT6', { container: 'BSIU8284765', origem: 'CLEVELAND', destino: 'SANTOS' });
    await del('HLCUBSC2512BXZT6');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','GOE','Gate out empty','2025-12-16 11:45:00','CLEVELAND','Truck','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','ARR','Arrival in','2025-12-19 07:24:00','CLEVELAND','Truck','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','DEP','Departure from','2025-12-20 05:42:00','CLEVELAND','Rail','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','ARR','Arrival in','2025-12-23 20:16:00','PORT ELIZABETH','Rail','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','DEP','Departure from','2025-12-26 14:02:00','PORT ELIZABETH','Truck','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','ARR','Arrival in','2025-12-26 14:04:00','NEW YORK','Truck','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','CRG','Loaded','2026-01-05 16:13:00','NEW YORK','WIELAND','601S');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','DEP','Vessel departed','2026-01-06 06:51:00','NEW YORK','WIELAND','601S');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','ARR','Vessel arrived','2026-01-27 12:32:00','SANTOS','WIELAND','601S');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','DCH','Discharged','2026-01-28 07:44:00','SANTOS','WIELAND','601S');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','DEP','Departure from','2026-02-10 04:33:00','SANTOS','Truck','');
    await ins('HLCUBSC2512BXZT6','BSIU8284765','GIE','Gate in empty','2026-02-10 18:08:00','SANTOS','Truck','');
    await upd('HLCUBSC2512BXZT6', { last_event: 'Gate in empty - SANTOS', navio: 'WIELAND', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2512BXZT6', status: 'ok', events: 12 });

    // HLCUBSC2601BKLC4
    await upd('HLCUBSC2601BKLC4', { container: 'HLXU1113512', origem: 'MORRIS', destino: 'SANTOS' });
    await del('HLCUBSC2601BKLC4');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','GOE','Gate out empty','2026-01-14 05:59:00','MORRIS','Truck','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','ARR','Arrival in','2026-01-14 15:12:00','CHICAGO','Truck','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','DEP','Departure from','2026-01-15 04:00:00','CHICAGO','Rail','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','ARR','Arrival in','2026-01-17 15:36:00','PORT ELIZABETH','Rail','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','DEP','Departure from','2026-01-19 16:54:00','PORT ELIZABETH','Truck','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','ARR','Arrival in','2026-01-19 16:56:00','NEW YORK','Truck','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','CRG','Loaded','2026-01-29 08:50:00','NEW YORK','MAERSK MONTE ALEGRE','605S');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','DEP','Vessel departed','2026-01-29 18:57:00','NEW YORK','MAERSK MONTE ALEGRE','605S');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','ARR','Vessel arrived','2026-02-18 01:46:00','SANTOS','MAERSK MONTE ALEGRE','605S');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','DCH','Discharged','2026-02-18 16:33:00','SANTOS','MAERSK MONTE ALEGRE','605S');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','DEP','Departure from','2026-02-19 14:57:00','SANTOS','Truck','');
    await ins('HLCUBSC2601BKLC4','HLXU1113512','GIE','Gate in empty','2026-03-02 14:08:00','SANTOS','Rail','');
    await upd('HLCUBSC2601BKLC4', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK MONTE ALEGRE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2601BKLC4', status: 'ok', events: 12 });

    // HLCUHAM251140437
    await upd('HLCUHAM251140437', { container: 'BEAU4991522', origem: 'MANNHEIM', destino: 'SAO JOSE DOS PINHAIS' });
    await del('HLCUHAM251140437');
    await ins('HLCUHAM251140437','BEAU4991522','GOE','Gate out empty','2025-11-28 13:19:00','MANNHEIM','Truck','');
    await ins('HLCUHAM251140437','BEAU4991522','ARR','Arrival in','2025-12-03 05:28:00','ROTTERDAM','Rail','');
    await ins('HLCUHAM251140437','BEAU4991522','CRG','Loaded','2025-12-09 14:24:00','ROTTERDAM','MSC CHLOE','NA549A');
    await ins('HLCUHAM251140437','BEAU4991522','DEP','Vessel departed','2025-12-10 04:30:00','ROTTERDAM','MSC CHLOE','NA549A');
    await ins('HLCUHAM251140437','BEAU4991522','ARR','Vessel arrived','2026-01-27 01:10:00','PARANAGUA','MSC CHLOE','NA549A');
    await ins('HLCUHAM251140437','BEAU4991522','DCH','Discharged','2026-01-27 03:48:00','PARANAGUA','MSC CHLOE','NA549A');
    await ins('HLCUHAM251140437','BEAU4991522','DEP','Departure from','2026-02-02 21:21:00','PARANAGUA','Truck','');
    await ins('HLCUHAM251140437','BEAU4991522','GIE','Gate in empty','2026-02-04 13:48:00','SAO JOSE DOS PINHAIS','Truck','');
    await upd('HLCUHAM251140437', { last_event: 'Gate in empty - SAO JOSE DOS PINHAIS', navio: 'MSC CHLOE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM251140437', status: 'ok', events: 8 });

    await conn.end();
    console.log('[batch6b] Done:', results.length, 'MBLs');
    return new Response(JSON.stringify({ success: true, batch: '6b', updated_count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error('[batch6b] Error:', e);
    return new Response(JSON.stringify({ error: e.message, partial_results: results }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
