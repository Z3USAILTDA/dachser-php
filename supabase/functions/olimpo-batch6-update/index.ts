import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const mariadbHost = Deno.env.get('MARIADB_HOST');
  const mariadbPort = Deno.env.get('MARIADB_PORT') || '3306';
  const mariadbUser = Deno.env.get('MARIADB_USER');
  const mariadbPass = Deno.env.get('MARIADB_PASSWORD');
  const mariadbDb = 'dados_dachser';

  if (!mariadbHost || !mariadbUser || !mariadbPass) {
    return new Response(JSON.stringify({ error: 'MariaDB não configurado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const results: any[] = [];

  try {
    const { Client } = await import("https://deno.land/x/mysql@v2.12.1/mod.ts");
    const client = await new Client().connect({
      hostname: mariadbHost,
      port: parseInt(mariadbPort, 10),
      username: mariadbUser,
      password: mariadbPass,
      db: mariadbDb,
    });

    console.log('[batch6] Starting Batch 6 manual update - 42 MBLs');

    // Helper: insert event
    const insertEvent = async (mbl: string, container: string, code: string, desc: string, dt: string, location: string, vessel: string, voyage: string) => {
      await client.execute(
        `INSERT IGNORE INTO dados_dachser.t_tracking_sea_history 
         (mbl_id, container, event_code, event_description, event_datetime, location, vessel_name, voyage, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', NOW())`,
        [mbl, container, code, desc, dt, location, vessel, voyage]
      );
    };

    // Helper: update main record
    const updateMain = async (mbl: string, data: Record<string, any>) => {
      const sets: string[] = [];
      const vals: any[] = [];
      for (const [k, v] of Object.entries(data)) {
        sets.push(`${k} = ?`);
        vals.push(v);
      }
      sets.push('updated_at = NOW()');
      vals.push(mbl);
      await client.execute(
        `UPDATE dados_dachser.t_tracking_sea SET ${sets.join(', ')} WHERE mbl_id = ?`,
        vals
      );
    };

    // Helper: delete history
    const deleteHistory = async (mbl: string) => {
      await client.execute(`DELETE FROM dados_dachser.t_tracking_sea_history WHERE mbl_id = ?`, [mbl]);
    };

    // ========================
    // SEM INFORMAÇÃO (8 MBLs)
    // ========================
    const semInfo = [
      'HLCUIT1260305275', 'HLCUIT1260309210', 'HLCUPN4260353977',
      'HLCUPN4260264788', 'HLCUSS5260218029', 'HLCUSS5260224404',
      'HLCUSS5260224766', 'HLCUSS5260238551'
    ];
    for (const mbl of semInfo) {
      await updateMain(mbl, { container_status: 'NAO_ENCONTRADO', last_event: 'Sem informação no armador' });
      results.push({ mbl, status: 'ok', info: 'sem_informacao' });
    }
    console.log('[batch6] Sem informação: 8 done');

    // ========================
    // HLCU COM EVENTOS COMPLETOS
    // ========================

    // --- HLCUSS5251266740 (dedup - aparece 2x na lista) ---
    await updateMain('HLCUSS5251266740', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5251266740');
    await insertEvent('HLCUSS5251266740', 'HAMU2543634', 'GOE', 'Gate out empty', '2026-01-23 12:48:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266740', 'HAMU2543634', 'ARR', 'Arrival in', '2026-02-13 23:46:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266740', 'HAMU2543634', 'CRG', 'Loaded', '2026-02-23 16:01:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5251266740', 'HAMU2543634', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', '');
    await updateMain('HLCUSS5251266740', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266740', status: 'ok', events: 4 });

    // --- HLCUSS5251266750 ---
    await updateMain('HLCUSS5251266750', { container: 'HAMU3133613', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5251266750');
    await insertEvent('HLCUSS5251266750', 'HAMU3133613', 'GOE', 'Gate out empty', '2026-01-24 02:16:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266750', 'HAMU3133613', 'ARR', 'Arrival in', '2026-02-13 17:39:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266750', 'HAMU3133613', 'CRG', 'Loaded', '2026-02-23 16:33:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5251266750', 'HAMU3133613', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5251266750', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266750', status: 'ok', events: 4 });

    // --- HLCUSS5251266761 ---
    await updateMain('HLCUSS5251266761', { container: 'HAMU4743950', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5251266761');
    await insertEvent('HLCUSS5251266761', 'HAMU4743950', 'GOE', 'Gate out empty', '2026-01-24 02:19:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266761', 'HAMU4743950', 'ARR', 'Arrival in', '2026-02-13 15:42:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266761', 'HAMU4743950', 'CRG', 'Loaded', '2026-02-23 16:52:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5251266761', 'HAMU4743950', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5251266761', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266761', status: 'ok', events: 4 });

    // --- HLCUSS5251266772 ---
    await updateMain('HLCUSS5251266772', { container: 'HAMU4518008', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5251266772');
    await insertEvent('HLCUSS5251266772', 'HAMU4518008', 'GOE', 'Gate out empty', '2026-01-27 09:48:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266772', 'HAMU4518008', 'ARR', 'Arrival in', '2026-02-13 10:26:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251266772', 'HAMU4518008', 'CRG', 'Loaded', '2026-02-23 15:52:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5251266772', 'HAMU4518008', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5251266772', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266772', status: 'ok', events: 4 });

    // --- HLCUSS5260210685 ---
    await updateMain('HLCUSS5260210685', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5260210685');
    await insertEvent('HLCUSS5260210685', 'HAMU2543634', 'GOE', 'Gate out empty', '2026-01-23 12:48:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210685', 'HAMU2543634', 'ARR', 'Arrival in', '2026-02-13 23:46:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210685', 'HAMU2543634', 'CRG', 'Loaded', '2026-02-23 16:01:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5260210685', 'HAMU2543634', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5260210685', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260210685', status: 'ok', events: 4 });

    // --- HLCUSS5260210696 ---
    await updateMain('HLCUSS5260210696', { container: 'HAMU4249552', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await deleteHistory('HLCUSS5260210696');
    await insertEvent('HLCUSS5260210696', 'HAMU4249552', 'GOE', 'Gate out empty', '2026-02-25 14:02:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210696', 'HAMU4249552', 'ARR', 'Arrival in', '2026-03-06 12:56:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUSS5260210696', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210696', status: 'ok', events: 2 });

    // --- HLCUSS5260210703 ---
    await updateMain('HLCUSS5260210703', { container: 'HAMU2373158', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await deleteHistory('HLCUSS5260210703');
    await insertEvent('HLCUSS5260210703', 'HAMU2373158', 'GOE', 'Gate out empty', '2026-02-25 13:15:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210703', 'HAMU2373158', 'ARR', 'Arrival in', '2026-03-06 09:12:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUSS5260210703', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210703', status: 'ok', events: 2 });

    // --- HLCUSS5260210714 ---
    await updateMain('HLCUSS5260210714', { container: 'HAMU3017850', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await deleteHistory('HLCUSS5260210714');
    await insertEvent('HLCUSS5260210714', 'HAMU3017850', 'GOE', 'Gate out empty', '2026-02-25 13:03:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210714', 'HAMU3017850', 'ARR', 'Arrival in', '2026-03-07 06:33:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUSS5260210714', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210714', status: 'ok', events: 2 });

    // --- HLCUSS5260210747 ---
    await updateMain('HLCUSS5260210747', { container: 'HAMU2980763', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await deleteHistory('HLCUSS5260210747');
    await insertEvent('HLCUSS5260210747', 'HAMU2980763', 'GOE', 'Gate out empty', '2026-02-25 16:36:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260210747', 'HAMU2980763', 'ARR', 'Arrival in', '2026-03-06 12:22:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUSS5260210747', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210747', status: 'ok', events: 2 });

    // --- HLCUSS5260223489 ---
    await updateMain('HLCUSS5260223489', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5260223489');
    await insertEvent('HLCUSS5260223489', 'HAMU2543634', 'GOE', 'Gate out empty', '2026-01-23 12:48:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260223489', 'HAMU2543634', 'ARR', 'Arrival in', '2026-02-13 23:46:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260223489', 'HAMU2543634', 'CRG', 'Loaded', '2026-02-23 16:01:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5260223489', 'HAMU2543634', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5260223489', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260223489', status: 'ok', events: 4 });

    // --- HLCUSS5260223507 ---
    await updateMain('HLCUSS5260223507', { container: 'HAMU1054080', origem: 'SANTOS', destino: 'CARTAGENA', eta: '2026-03-13' });
    await deleteHistory('HLCUSS5260223507');
    await insertEvent('HLCUSS5260223507', 'HAMU1054080', 'GOE', 'Gate out empty', '2026-02-18 15:08:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260223507', 'HAMU1054080', 'ARR', 'Arrival in', '2026-02-27 05:05:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260223507', 'HAMU1054080', 'CRG', 'Loaded', '2026-03-02 01:25:00', 'SANTOS', 'COSTA RICA EXPRESS', '2602N');
    await insertEvent('HLCUSS5260223507', 'HAMU1054080', 'DEP', 'Vessel departed', '2026-03-02 14:38:00', 'SANTOS', 'COSTA RICA EXPRESS', '2602N');
    await updateMain('HLCUSS5260223507', { last_event: 'Vessel departed - SANTOS', navio: 'COSTA RICA EXPRESS', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260223507', status: 'ok', events: 4 });

    // --- HLCUSS5260224554 ---
    await updateMain('HLCUSS5260224554', { container: 'FCIU4520417', origem: 'SANTOS', destino: 'CARTAGENA', eta: '2026-03-25' });
    await deleteHistory('HLCUSS5260224554');
    await insertEvent('HLCUSS5260224554', 'FCIU4520417', 'GOE', 'Gate out empty', '2026-01-23 12:48:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260224554', 'FCIU4520417', 'ARR', 'Arrival in', '2026-02-13 23:46:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5260224554', 'FCIU4520417', 'CRG', 'Loaded', '2026-02-23 16:01:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await insertEvent('HLCUSS5260224554', 'FCIU4520417', 'DEP', 'Vessel departed', '2026-02-24 10:10:00', 'SANTOS', 'MSC MUGE', 'NA607R');
    await updateMain('HLCUSS5260224554', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260224554', status: 'ok', events: 4 });

    // --- HLCUSS5260232544 ---
    await updateMain('HLCUSS5260232544', { container: 'HAMU1439754', origem: 'SANTOS', destino: 'CHICAGO', eta: '2026-04-12' });
    await deleteHistory('HLCUSS5260232544');
    await insertEvent('HLCUSS5260232544', 'HAMU1439754', 'GOE', 'Gate out empty', '2026-02-27 12:05:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUSS5260232544', { last_event: 'Gate out empty - SANTOS', container_status: 'GOE' });
    results.push({ mbl: 'HLCUSS5260232544', status: 'ok', events: 1 });

    // --- HLCUVL1260106197 ---
    await updateMain('HLCUVL1260106197', { container: 'UETU2724780', origem: 'VALENCIA', destino: 'PARANAGUA' });
    await deleteHistory('HLCUVL1260106197');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'GOE', 'Gate out empty', '2026-01-20 15:59:00', 'VALENCIA', 'Truck', '');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'ARR', 'Arrival in', '2026-01-21 13:00:00', 'VALENCIA', 'Truck', '');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'CRG', 'Loaded', '2026-02-03 11:41:00', 'VALENCIA', 'COPIAPO', 'MM604A');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'DEP', 'Vessel departed', '2026-02-03 22:53:00', 'VALENCIA', 'COPIAPO', 'MM604A');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'ARR', 'Vessel arrived', '2026-02-20 18:07:00', 'PARANAGUA', 'COPIAPO', 'MM604A');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'DCH', 'Discharged', '2026-02-21 02:17:00', 'PARANAGUA', 'COPIAPO', 'MM604A');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'DEP', 'Departure from', '2026-02-25 21:16:00', 'PARANAGUA', 'Truck', '');
    await insertEvent('HLCUVL1260106197', 'UETU2724780', 'GIE', 'Gate in empty', '2026-02-27 09:49:00', 'PARANAGUA', 'Truck', '');
    await updateMain('HLCUVL1260106197', { last_event: 'Gate in empty - PARANAGUA', navio: 'COPIAPO', container_status: 'DLV' });
    results.push({ mbl: 'HLCUVL1260106197', status: 'ok', events: 8 });

    // --- HLCUBKK260144990 ---
    await updateMain('HLCUBKK260144990', { container: 'LYGU8074553', origem: 'BANG PHLI', destino: 'SANTOS', eta: '2026-03-29' });
    await deleteHistory('HLCUBKK260144990');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'GOE', 'Gate out empty', '2026-01-24 10:34:00', 'BANG PHLI', 'Truck', '');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'ARR', 'Arrival in', '2026-01-24 20:51:00', 'LAT KRABANG', 'Truck', '');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'DEP', 'Departure from', '2026-01-25 22:13:00', 'LAT KRABANG', 'Truck', '');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'ARR', 'Arrival in', '2026-01-28 04:25:00', 'LAEM CHABANG', 'Truck', '');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'CRG', 'Loaded', '2026-02-05 21:31:00', 'LAEM CHABANG', 'KOTA LAMBANG', '606E');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'DEP', 'Vessel departed', '2026-02-06 13:42:00', 'LAEM CHABANG', 'KOTA LAMBANG', '606E');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'ARR', 'Vessel arrived', '2026-02-10 08:27:00', 'YANTIAN', 'KOTA LAMBANG', '606E');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'DCH', 'Discharged', '2026-02-11 15:52:00', 'YANTIAN', 'KOTA LAMBANG', '606E');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'CRG', 'Loaded', '2026-03-03 11:29:00', 'YANTIAN', 'ZIM BANGKOK', '014W');
    await insertEvent('HLCUBKK260144990', 'LYGU8074553', 'DEP', 'Vessel departed', '2026-03-03 20:35:00', 'YANTIAN', 'ZIM BANGKOK', '014W');
    await updateMain('HLCUBKK260144990', { last_event: 'Vessel departed - YANTIAN', navio: 'ZIM BANGKOK', container_status: 'DEP' });
    results.push({ mbl: 'HLCUBKK260144990', status: 'ok', events: 10 });

    // --- HLCUHAM2512AVRE3 ---
    await updateMain('HLCUHAM2512AVRE3', { container: 'BMOU6536163', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2512AVRE3');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'GOE', 'Gate out empty', '2026-01-15 16:09:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'ARR', 'Arrival in', '2026-01-16 13:10:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'DEP', 'Departure from', '2026-01-17 18:47:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'ARR', 'Arrival in', '2026-01-20 03:52:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'CRG', 'Loaded', '2026-01-25 08:40:00', 'HAMBURG', 'MSC INSA', 'NA603A');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'DEP', 'Vessel departed', '2026-01-25 18:45:00', 'HAMBURG', 'MSC INSA', 'NA603A');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'ARR', 'Vessel arrived', '2026-02-28 01:25:00', 'RIO GRANDE', 'MSC INSA', 'NA603A');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'DCH', 'Discharged', '2026-02-28 04:42:00', 'RIO GRANDE', 'MSC INSA', 'NA603A');
    await insertEvent('HLCUHAM2512AVRE3', 'BMOU6536163', 'DEP', 'Departure from', '2026-03-06 20:27:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2512AVRE3', { last_event: 'Departure from - RIO GRANDE', navio: 'MSC INSA', container_status: 'DEP' });
    results.push({ mbl: 'HLCUHAM2512AVRE3', status: 'ok', events: 9 });

    // --- HLCUSS5251250005 ---
    await updateMain('HLCUSS5251250005', { container: 'FFAU5216356', origem: 'SANTOS', destino: 'JOHANNESBURG' });
    await deleteHistory('HLCUSS5251250005');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'GOE', 'Gate out empty', '2026-01-15 09:27:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'ARR', 'Arrival in', '2026-01-22 07:35:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'CRG', 'Loaded', '2026-01-24 21:58:00', 'SANTOS', 'NC BRUMA', '022N');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'DEP', 'Vessel departed', '2026-01-25 10:30:00', 'SANTOS', 'NC BRUMA', '022N');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'ARR', 'Vessel arrived', '2026-01-26 14:37:00', 'PARANAGUA', 'NC BRUMA', '022N');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'DCH', 'Discharged', '2026-01-27 06:06:00', 'PARANAGUA', 'NC BRUMA', '022N');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'CRG', 'Loaded', '2026-01-30 05:06:00', 'PARANAGUA', 'MIRADOR EXPRESS', '2605E');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'DEP', 'Vessel departed', '2026-01-30 12:03:00', 'PARANAGUA', 'MIRADOR EXPRESS', '2605E');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'ARR', 'Vessel arrived', '2026-02-15 17:27:00', 'DURBAN', 'MIRADOR EXPRESS', '2605E');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'DCH', 'Discharged', '2026-02-16 13:14:00', 'DURBAN', 'MIRADOR EXPRESS', '2605E');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'DEP', 'Departure from', '2026-02-19 09:54:00', 'DURBAN', 'Truck', '');
    await insertEvent('HLCUSS5251250005', 'FFAU5216356', 'GIE', 'Gate in empty', '2026-02-23 13:36:00', 'JOHANNESBURG', 'Truck', '');
    await updateMain('HLCUSS5251250005', { last_event: 'Gate in empty - JOHANNESBURG', navio: 'MIRADOR EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUSS5251250005', status: 'ok', events: 12 });

    // --- HLCULE1251217669 ---
    await updateMain('HLCULE1251217669', { container: 'HLXU3744733', origem: 'LE HAVRE', destino: 'PARANAGUA' });
    await deleteHistory('HLCULE1251217669');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'GOE', 'Gate out empty', '2025-12-30 19:38:00', 'LE HAVRE', 'Truck', '');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'ARR', 'Arrival in', '2025-12-31 11:53:00', 'LE HAVRE', 'Truck', '');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'CRG', 'Loaded', '2026-01-10 08:13:00', 'LE HAVRE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'DEP', 'Vessel departed', '2026-01-10 18:15:00', 'LE HAVRE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'ARR', 'Vessel arrived', '2026-02-10 09:15:00', 'PARANAGUA', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'DCH', 'Discharged', '2026-02-10 18:45:00', 'PARANAGUA', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'DEP', 'Departure from', '2026-02-12 05:34:00', 'PARANAGUA', 'Truck', '');
    await insertEvent('HLCULE1251217669', 'HLXU3744733', 'GIE', 'Gate in empty', '2026-02-12 14:15:00', 'PARANAGUA', 'Truck', '');
    await updateMain('HLCULE1251217669', { last_event: 'Gate in empty - PARANAGUA', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCULE1251217669', status: 'ok', events: 8 });

    // --- HLCUBC1251263706 ---
    await updateMain('HLCUBC1251263706', { container: 'TDSU1048004', origem: 'BARCELONA', destino: 'SANTOS' });
    await deleteHistory('HLCUBC1251263706');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'GOE', 'Gate out empty', '2026-01-23 08:40:00', 'BARCELONA', 'Truck', '');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'ARR', 'Arrival in', '2026-01-23 13:21:00', 'BARCELONA', 'Truck', '');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'CRG', 'Loaded', '2026-02-04 10:57:00', 'BARCELONA', 'CAPE AKRITAS', 'MC604A');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'DEP', 'Vessel departed', '2026-02-05 06:31:00', 'BARCELONA', 'CAPE AKRITAS', 'MC604A');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'ARR', 'Vessel arrived', '2026-02-24 14:05:00', 'SANTOS', 'MSC ANTIGUA', 'MM605A');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'DCH', 'Discharged', '2026-02-24 18:32:00', 'SANTOS', 'MSC ANTIGUA', 'MM605A');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'DEP', 'Departure from', '2026-03-04 12:01:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBC1251263706', 'TDSU1048004', 'GIE', 'Gate in empty', '2026-03-04 18:56:00', 'SANTOS', 'Rail', '');
    await updateMain('HLCUBC1251263706', { last_event: 'Gate in empty - SANTOS', navio: 'MSC ANTIGUA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBC1251263706', status: 'ok', events: 12 });

    // --- HLCUBC1251213949 ---
    await updateMain('HLCUBC1251213949', { container: 'GCXU2194037', origem: 'BARCELONA', destino: 'SANTOS' });
    await deleteHistory('HLCUBC1251213949');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'GOE', 'Gate out empty', '2025-12-22 07:23:00', 'BARCELONA', 'Truck', '');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'ARR', 'Arrival in', '2025-12-22 13:09:00', 'BARCELONA', 'Truck', '');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'CRG', 'Loaded', '2025-12-29 00:04:00', 'BARCELONA', 'MSC AGADIR', 'MM552A');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'DEP', 'Vessel departed', '2025-12-29 08:11:00', 'BARCELONA', 'MSC AGADIR', 'MM552A');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'ARR', 'Vessel arrived', '2026-01-20 13:47:00', 'SANTOS', 'MSC AGADIR', 'MM552A');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'DCH', 'Discharged', '2026-01-20 20:25:00', 'SANTOS', 'MSC AGADIR', 'MM552A');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'DEP', 'Departure from', '2026-01-21 18:24:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBC1251213949', 'GCXU2194037', 'GIE', 'Gate in empty', '2026-01-31 07:01:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUBC1251213949', { last_event: 'Gate in empty - SANTOS', navio: 'MSC AGADIR', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBC1251213949', status: 'ok', events: 8 });

    // --- HLCUBSC251212360 ---
    await updateMain('HLCUBSC251212360', { container: 'FANU3088183', origem: 'WORCESTER', destino: 'SANTOS' });
    await deleteHistory('HLCUBSC251212360');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'GOE', 'Gate out empty', '2025-12-30 07:45:00', 'WORCESTER', 'Truck', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'ARR', 'Arrival in', '2025-12-31 09:02:00', 'WORCESTER', 'Truck', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'DEP', 'Departure from', '2026-01-02 08:00:00', 'WORCESTER', 'Rail', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'ARR', 'Arrival in', '2026-01-10 06:52:00', 'PORT ELIZABETH', 'Rail', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'DEP', 'Departure from', '2026-01-10 08:46:00', 'PORT ELIZABETH', 'Truck', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'ARR', 'Arrival in', '2026-01-10 08:48:00', 'NEW YORK', 'Truck', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'CRG', 'Loaded', '2026-01-16 01:22:00', 'NEW YORK', 'MAERSK MONTE AZUL', '603S');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'DEP', 'Vessel departed', '2026-01-16 03:33:00', 'NEW YORK', 'MAERSK MONTE AZUL', '603S');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'ARR', 'Vessel arrived', '2026-02-11 03:30:00', 'SANTOS', 'MAERSK MONTE AZUL', '603S');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'DCH', 'Discharged', '2026-02-11 16:05:00', 'SANTOS', 'MAERSK MONTE AZUL', '603S');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'DEP', 'Departure from', '2026-02-12 12:51:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBSC251212360', 'FANU3088183', 'GIE', 'Gate in empty', '2026-02-20 14:25:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUBSC251212360', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK MONTE AZUL', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC251212360', status: 'ok', events: 12 });

    // --- HLCUBSC251286321 ---
    await updateMain('HLCUBSC251286321', { container: 'CAIU6986670', origem: 'CHARLESTON', destino: 'SANTOS' });
    await deleteHistory('HLCUBSC251286321');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'GOE', 'Gate out empty', '2026-01-07 07:08:00', 'CHARLESTON', 'Truck', '');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'ARR', 'Arrival in', '2026-01-08 06:05:00', 'CHARLESTON', 'Truck', '');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'CRG', 'Loaded', '2026-01-13 22:59:00', 'CHARLESTON', 'MAERSK FREEPORT', '602S');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'DEP', 'Vessel departed', '2026-01-14 03:53:00', 'CHARLESTON', 'MAERSK FREEPORT', '602S');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'ARR', 'Vessel arrived', '2026-02-03 02:41:00', 'SANTOS', 'MAERSK FREEPORT', '602S');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'DCH', 'Discharged', '2026-02-03 07:30:00', 'SANTOS', 'MAERSK FREEPORT', '602S');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'DEP', 'Departure from', '2026-02-05 01:16:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBSC251286321', 'CAIU6986670', 'GIE', 'Gate in empty', '2026-02-13 10:37:00', 'SANTOS', 'Rail', '');
    await updateMain('HLCUBSC251286321', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK FREEPORT', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC251286321', status: 'ok', events: 8 });

    // --- HLCUBSC2512BQWF4 ---
    await updateMain('HLCUBSC2512BQWF4', { container: 'BSIU8284765', origem: 'CLEVELAND', destino: 'SANTOS' });
    await deleteHistory('HLCUBSC2512BQWF4');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'GOE', 'Gate out empty', '2025-12-16 11:45:00', 'CLEVELAND', 'Truck', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-19 07:24:00', 'CLEVELAND', 'Truck', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'DEP', 'Departure from', '2025-12-20 05:42:00', 'CLEVELAND', 'Rail', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-23 20:16:00', 'PORT ELIZABETH', 'Rail', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'DEP', 'Departure from', '2025-12-26 14:02:00', 'PORT ELIZABETH', 'Truck', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-26 14:04:00', 'NEW YORK', 'Truck', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'CRG', 'Loaded', '2026-01-05 16:13:00', 'NEW YORK', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'DEP', 'Vessel departed', '2026-01-06 06:51:00', 'NEW YORK', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'ARR', 'Vessel arrived', '2026-01-27 12:32:00', 'SANTOS', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'DCH', 'Discharged', '2026-01-28 07:44:00', 'SANTOS', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'DEP', 'Departure from', '2026-02-10 04:33:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBSC2512BQWF4', 'BSIU8284765', 'GIE', 'Gate in empty', '2026-02-10 18:08:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUBSC2512BQWF4', { last_event: 'Gate in empty - SANTOS', navio: 'WIELAND', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2512BQWF4', status: 'ok', events: 12 });

    // --- HLCUBSC2512BXZT6 (same container as BQWF4) ---
    await updateMain('HLCUBSC2512BXZT6', { container: 'BSIU8284765', origem: 'CLEVELAND', destino: 'SANTOS' });
    await deleteHistory('HLCUBSC2512BXZT6');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'GOE', 'Gate out empty', '2025-12-16 11:45:00', 'CLEVELAND', 'Truck', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-19 07:24:00', 'CLEVELAND', 'Truck', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'DEP', 'Departure from', '2025-12-20 05:42:00', 'CLEVELAND', 'Rail', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-23 20:16:00', 'PORT ELIZABETH', 'Rail', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'DEP', 'Departure from', '2025-12-26 14:02:00', 'PORT ELIZABETH', 'Truck', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'ARR', 'Arrival in', '2025-12-26 14:04:00', 'NEW YORK', 'Truck', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'CRG', 'Loaded', '2026-01-05 16:13:00', 'NEW YORK', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'DEP', 'Vessel departed', '2026-01-06 06:51:00', 'NEW YORK', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'ARR', 'Vessel arrived', '2026-01-27 12:32:00', 'SANTOS', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'DCH', 'Discharged', '2026-01-28 07:44:00', 'SANTOS', 'WIELAND', '601S');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'DEP', 'Departure from', '2026-02-10 04:33:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBSC2512BXZT6', 'BSIU8284765', 'GIE', 'Gate in empty', '2026-02-10 18:08:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUBSC2512BXZT6', { last_event: 'Gate in empty - SANTOS', navio: 'WIELAND', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2512BXZT6', status: 'ok', events: 12 });

    // --- HLCUBSC2601BKLC4 ---
    await updateMain('HLCUBSC2601BKLC4', { container: 'HLXU1113512', origem: 'MORRIS', destino: 'SANTOS' });
    await deleteHistory('HLCUBSC2601BKLC4');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'GOE', 'Gate out empty', '2026-01-14 05:59:00', 'MORRIS', 'Truck', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'ARR', 'Arrival in', '2026-01-14 15:12:00', 'CHICAGO', 'Truck', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'DEP', 'Departure from', '2026-01-15 04:00:00', 'CHICAGO', 'Rail', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'ARR', 'Arrival in', '2026-01-17 15:36:00', 'PORT ELIZABETH', 'Rail', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'DEP', 'Departure from', '2026-01-19 16:54:00', 'PORT ELIZABETH', 'Truck', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'ARR', 'Arrival in', '2026-01-19 16:56:00', 'NEW YORK', 'Truck', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'CRG', 'Loaded', '2026-01-29 08:50:00', 'NEW YORK', 'MAERSK MONTE ALEGRE', '605S');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'DEP', 'Vessel departed', '2026-01-29 18:57:00', 'NEW YORK', 'MAERSK MONTE ALEGRE', '605S');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'ARR', 'Vessel arrived', '2026-02-18 01:46:00', 'SANTOS', 'MAERSK MONTE ALEGRE', '605S');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'DCH', 'Discharged', '2026-02-18 16:33:00', 'SANTOS', 'MAERSK MONTE ALEGRE', '605S');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'DEP', 'Departure from', '2026-02-19 14:57:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUBSC2601BKLC4', 'HLXU1113512', 'GIE', 'Gate in empty', '2026-03-02 14:08:00', 'SANTOS', 'Rail', '');
    await updateMain('HLCUBSC2601BKLC4', { last_event: 'Gate in empty - SANTOS', navio: 'MAERSK MONTE ALEGRE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUBSC2601BKLC4', status: 'ok', events: 12 });

    // --- HLCUHAM251140437 ---
    await updateMain('HLCUHAM251140437', { container: 'BEAU4991522', origem: 'MANNHEIM', destino: 'SAO JOSE DOS PINHAIS' });
    await deleteHistory('HLCUHAM251140437');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'GOE', 'Gate out empty', '2025-11-28 13:19:00', 'MANNHEIM', 'Truck', '');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'ARR', 'Arrival in', '2025-12-03 05:28:00', 'ROTTERDAM', 'Rail', '');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'CRG', 'Loaded', '2025-12-09 14:24:00', 'ROTTERDAM', 'MSC CHLOE', 'NA549A');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'DEP', 'Vessel departed', '2025-12-10 04:30:00', 'ROTTERDAM', 'MSC CHLOE', 'NA549A');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'ARR', 'Vessel arrived', '2026-01-27 01:10:00', 'PARANAGUA', 'MSC CHLOE', 'NA549A');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'DCH', 'Discharged', '2026-01-27 03:48:00', 'PARANAGUA', 'MSC CHLOE', 'NA549A');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'DEP', 'Departure from', '2026-02-02 21:21:00', 'PARANAGUA', 'Truck', '');
    await insertEvent('HLCUHAM251140437', 'BEAU4991522', 'GIE', 'Gate in empty', '2026-02-04 13:48:00', 'SAO JOSE DOS PINHAIS', 'Truck', '');
    await updateMain('HLCUHAM251140437', { last_event: 'Gate in empty - SAO JOSE DOS PINHAIS', navio: 'MSC CHLOE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM251140437', status: 'ok', events: 8 });

    // --- HLCUHAM2511ATSA8 ---
    await updateMain('HLCUHAM2511ATSA8', { container: 'HLBU2813832', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2511ATSA8');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'GOE', 'Gate out empty', '2025-12-18 09:34:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'ARR', 'Arrival in', '2025-12-18 14:13:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'DEP', 'Departure from', '2025-12-19 00:13:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'ARR', 'Arrival in', '2025-12-19 11:22:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'CRG', 'Loaded', '2025-12-30 16:02:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'DEP', 'Vessel departed', '2025-12-30 22:30:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'ARR', 'Vessel arrived', '2026-02-06 18:42:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'DCH', 'Discharged', '2026-02-06 21:42:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'DEP', 'Departure from', '2026-02-24 21:35:00', 'RIO GRANDE', 'Truck', '');
    await insertEvent('HLCUHAM2511ATSA8', 'HLBU2813832', 'GIE', 'Gate in empty', '2026-02-26 12:00:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2511ATSA8', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATSA8', status: 'ok', events: 10 });

    // --- HLCUHAM2511ATSF3 ---
    await updateMain('HLCUHAM2511ATSF3', { container: 'FANU3399776', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2511ATSF3');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'GOE', 'Gate out empty', '2025-12-18 07:27:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'ARR', 'Arrival in', '2025-12-18 12:27:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'DEP', 'Departure from', '2025-12-19 00:13:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'ARR', 'Arrival in', '2025-12-19 14:29:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'CRG', 'Loaded', '2025-12-30 16:01:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'DEP', 'Vessel departed', '2025-12-30 22:30:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'ARR', 'Vessel arrived', '2026-02-06 18:42:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'DCH', 'Discharged', '2026-02-06 21:45:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSF3', 'FANU3399776', 'DEP', 'Departure from', '2026-03-03 21:27:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2511ATSF3', { last_event: 'Departure from - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DEP' });
    results.push({ mbl: 'HLCUHAM2511ATSF3', status: 'ok', events: 9 });

    // --- HLCUHAM2511ATSK8 ---
    await updateMain('HLCUHAM2511ATSK8', { container: 'HAMU1807075', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2511ATSK8');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'GOE', 'Gate out empty', '2025-12-18 11:33:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'ARR', 'Arrival in', '2025-12-18 16:52:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'DEP', 'Departure from', '2025-12-19 00:13:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'ARR', 'Arrival in', '2025-12-19 11:23:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'CRG', 'Loaded', '2025-12-30 15:47:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'DEP', 'Vessel departed', '2025-12-30 22:30:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'ARR', 'Vessel arrived', '2026-02-06 18:42:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'DCH', 'Discharged', '2026-02-06 20:46:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'DEP', 'Departure from', '2026-02-27 23:27:00', 'RIO GRANDE', 'Truck', '');
    await insertEvent('HLCUHAM2511ATSK8', 'HAMU1807075', 'GIE', 'Gate in empty', '2026-03-03 09:02:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2511ATSK8', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATSK8', status: 'ok', events: 10 });

    // --- HLCUHAM2511ATUC1 ---
    await updateMain('HLCUHAM2511ATUC1', { container: 'HAMU3590250', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2511ATUC1');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'GOE', 'Gate out empty', '2025-12-17 17:13:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'ARR', 'Arrival in', '2025-12-18 11:40:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'DEP', 'Departure from', '2025-12-19 00:13:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'ARR', 'Arrival in', '2025-12-19 11:23:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'CRG', 'Loaded', '2025-12-30 15:54:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'DEP', 'Vessel departed', '2025-12-30 22:30:00', 'HAMBURG', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'ARR', 'Vessel arrived', '2026-02-06 18:42:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'DCH', 'Discharged', '2026-02-06 20:52:00', 'RIO GRANDE', 'LAEM CHABANG EXPRESS', 'NA551A');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'DEP', 'Departure from', '2026-02-13 21:33:00', 'RIO GRANDE', 'Truck', '');
    await insertEvent('HLCUHAM2511ATUC1', 'HAMU3590250', 'GIE', 'Gate in empty', '2026-02-18 12:00:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2511ATUC1', { last_event: 'Gate in empty - RIO GRANDE', navio: 'LAEM CHABANG EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511ATUC1', status: 'ok', events: 10 });

    // --- HLCUHAM2511AUCB0 ---
    await updateMain('HLCUHAM2511AUCB0', { container: 'FFAU5456505', origem: 'LUDWIGSBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM2511AUCB0');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'GOE', 'Gate out empty', '2026-01-09 14:49:00', 'LUDWIGSBURG', 'Truck', '');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'ARR', 'Arrival in', '2026-01-12 14:02:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'DEP', 'Departure from', '2026-01-14 15:30:00', 'LUDWIGSBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'ARR', 'Arrival in', '2026-01-15 11:50:00', 'HAMBURG', 'Rail', '');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'CRG', 'Loaded', '2026-01-17 05:06:00', 'HAMBURG', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'DEP', 'Vessel departed', '2026-01-17 09:28:00', 'HAMBURG', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'ARR', 'Vessel arrived', '2026-02-22 21:00:00', 'RIO GRANDE', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'DCH', 'Discharged', '2026-02-23 07:02:00', 'RIO GRANDE', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'DEP', 'Departure from', '2026-03-05 21:18:00', 'RIO GRANDE', 'Truck', '');
    await insertEvent('HLCUHAM2511AUCB0', 'FFAU5456505', 'GIE', 'Gate in empty', '2026-03-09 16:12:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM2511AUCB0', { last_event: 'Gate in empty - RIO GRANDE', navio: 'XIAMEN EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511AUCB0', status: 'ok', events: 10 });

    // --- HLCUHAM2511BFSV1 ---
    await updateMain('HLCUHAM2511BFSV1', { container: 'HLBU3777935', origem: 'MANNHEIM', destino: 'PARANAGUA' });
    await deleteHistory('HLCUHAM2511BFSV1');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'GOE', 'Gate out empty', '2025-12-05 13:11:00', 'MANNHEIM', 'Truck', '');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'ARR', 'Arrival in', '2025-12-09 21:55:00', 'ROTTERDAM', 'Rail', '');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'CRG', 'Loaded', '2025-12-19 11:02:00', 'ROTTERDAM', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'DEP', 'Vessel departed', '2025-12-20 02:00:00', 'ROTTERDAM', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'ARR', 'Vessel arrived', '2026-01-27 22:58:00', 'PARANAGUA', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'DCH', 'Discharged', '2026-01-28 11:35:00', 'PARANAGUA', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'DEP', 'Departure from', '2026-02-02 16:39:00', 'PARANAGUA', 'Truck', '');
    await insertEvent('HLCUHAM2511BFSV1', 'HLBU3777935', 'GIE', 'Gate in empty', '2026-02-05 16:44:00', 'PARANAGUA', 'Truck', '');
    await updateMain('HLCUHAM2511BFSV1', { last_event: 'Gate in empty - PARANAGUA', navio: 'MSC LEILA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BFSV1', status: 'ok', events: 8 });

    // --- HLCUHAM2511BJAG8 ---
    await updateMain('HLCUHAM2511BJAG8', { container: 'HAMU1133790', origem: 'LUDWIGSHAFEN', destino: 'PARANAGUA' });
    await deleteHistory('HLCUHAM2511BJAG8');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'GOE', 'Gate out empty', '2025-12-17 16:47:00', 'LUDWIGSHAFEN', 'Truck', '');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'ARR', 'Arrival in', '2025-12-23 20:42:00', 'ROTTERDAM', 'Rail', '');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'CRG', 'Loaded', '2025-12-31 07:04:00', 'ROTTERDAM', 'MSC MUGE', 'NA552A');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'DEP', 'Vessel departed', '2025-12-31 12:43:00', 'ROTTERDAM', 'MSC MUGE', 'NA552A');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'ARR', 'Vessel arrived', '2026-02-19 10:27:00', 'PARANAGUA', 'MSC MUGE', 'NA552A');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'DCH', 'Discharged', '2026-02-20 00:46:00', 'PARANAGUA', 'MSC MUGE', 'NA552A');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'DEP', 'Departure from', '2026-03-03 17:36:00', 'PARANAGUA', 'Truck', '');
    await insertEvent('HLCUHAM2511BJAG8', 'HAMU1133790', 'GIE', 'Gate in empty', '2026-03-05 18:10:00', 'PARANAGUA', 'Truck', '');
    await updateMain('HLCUHAM2511BJAG8', { last_event: 'Gate in empty - PARANAGUA', navio: 'MSC MUGE', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BJAG8', status: 'ok', events: 8 });

    // --- HLCUHAM2511BKFF2 ---
    await updateMain('HLCUHAM2511BKFF2', { container: 'FCIU7099723', origem: 'BASLE', destino: 'SANTOS' });
    await deleteHistory('HLCUHAM2511BKFF2');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'GOE', 'Gate out empty', '2025-12-02 12:20:00', 'BASLE', 'Truck', '');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'ARR', 'Arrival in', '2025-12-08 21:51:00', 'ROTTERDAM', 'Rail', '');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'CRG', 'Loaded', '2025-12-19 02:56:00', 'ROTTERDAM', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'DEP', 'Vessel departed', '2025-12-20 02:00:00', 'ROTTERDAM', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'ARR', 'Vessel arrived', '2026-01-16 23:41:00', 'SANTOS', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'DCH', 'Discharged', '2026-01-17 09:21:00', 'SANTOS', 'MSC LEILA', 'NA550A');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'DEP', 'Departure from', '2026-01-17 13:46:00', 'SANTOS', 'Truck', '');
    await insertEvent('HLCUHAM2511BKFF2', 'FCIU7099723', 'GIE', 'Gate in empty', '2026-01-30 13:41:00', 'SANTOS', 'Truck', '');
    await updateMain('HLCUHAM2511BKFF2', { last_event: 'Gate in empty - SANTOS', navio: 'MSC LEILA', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM2511BKFF2', status: 'ok', events: 8 });

    // --- HLCUHAM251297195 ---
    await updateMain('HLCUHAM251297195', { container: 'HLBU1518600', origem: 'DUISBURG', destino: 'RIO GRANDE' });
    await deleteHistory('HLCUHAM251297195');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'GOE', 'Gate out empty', '2026-01-07 07:29:00', 'DUISBURG', 'Truck', '');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'ARR', 'Arrival in', '2026-01-12 11:13:00', 'ANTWERP', 'Waterway', '');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'CRG', 'Loaded', '2026-01-19 11:39:00', 'ANTWERP', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'DEP', 'Vessel departed', '2026-01-19 19:04:00', 'ANTWERP', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'ARR', 'Vessel arrived', '2026-02-22 21:00:00', 'RIO GRANDE', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'DCH', 'Discharged', '2026-02-23 07:34:00', 'RIO GRANDE', 'XIAMEN EXPRESS', 'NA601A');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'DEP', 'Departure from', '2026-03-04 20:22:00', 'RIO GRANDE', 'Truck', '');
    await insertEvent('HLCUHAM251297195', 'HLBU1518600', 'GIE', 'Gate in empty', '2026-03-06 08:50:00', 'RIO GRANDE', 'Truck', '');
    await updateMain('HLCUHAM251297195', { last_event: 'Gate in empty - RIO GRANDE', navio: 'XIAMEN EXPRESS', container_status: 'DLV' });
    results.push({ mbl: 'HLCUHAM251297195', status: 'ok', events: 8 });

    console.log('[batch6] HLCU updates done');

    // ========================
    // ONEY - Empty Container Returned (DLV)
    // ========================
    const oneyDlv = [
      { mbl: 'ONEYHAMF95967300', containers: ['FDCU0480240', 'TCLU8492630'], event: 'Empty Container Returned from Customer', dt: '2026-02-11 14:23:00', location: 'ITAJAI' },
      { mbl: 'ONEYHAMF95967301', containers: ['ONEU1754906'], event: 'Empty Container Returned from Customer', dt: '2026-02-10 09:52:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA1465500', containers: ['ONEU1066776'], event: 'Empty Container Returned from Customer', dt: '2026-01-22 06:53:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA1479300', containers: ['KKFU8036219'], event: 'Empty Container Returned from Customer', dt: '2026-01-21 07:27:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA1482400', containers: ['ONEU6544501'], event: 'Empty Container Returned from Customer', dt: '2026-01-22 08:10:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA1484600', containers: ['TLLU5513548'], event: 'Empty Container Returned from Customer', dt: '2026-01-21 07:32:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA1791700', containers: ['FSCU8616368'], event: 'Empty Container Returned from Customer', dt: '2026-01-22 07:48:00', location: 'N/A' },
      { mbl: 'ONEYHAMFA6038600', containers: ['TRHU7336742'], event: 'Empty Container Returned from Customer', dt: '2026-02-05 10:11:00', location: 'N/A' },
      { mbl: 'ONEYMEXG00992700', containers: ['ONEU1106858'], event: 'Empty Container Returned from Customer', dt: '2026-03-06 12:24:00', location: 'N/A' },
    ];

    for (const item of oneyDlv) {
      const container = item.containers[0];
      await updateMain(item.mbl, { container, container_status: 'DLV', last_event: `${item.event} - ${item.location}` });
      await deleteHistory(item.mbl);
      await insertEvent(item.mbl, container, 'GIE', item.event, item.dt, item.location, '', '');
      // If multiple containers, just note in first
      results.push({ mbl: item.mbl, status: 'ok', info: 'oney_dlv', containers: item.containers });
    }
    console.log('[batch6] ONEY DLV done');

    // ========================
    // ONEYSAOG05421700 - com eventos de embarque
    // ========================
    await updateMain('ONEYSAOG05421700', { container: 'SEGU4975077', origem: 'SANTOS', destino: 'ANTWERP', eta: '2026-03-27' });
    await deleteHistory('ONEYSAOG05421700');
    await insertEvent('ONEYSAOG05421700', 'SEGU4975077', 'GOE', 'Empty Container Release to Shipper', '2026-02-07 10:26:00', 'SANTOS', '', '');
    await insertEvent('ONEYSAOG05421700', 'SEGU4975077', 'ARR', 'Gate In to Outbound Terminal', '2026-02-25 17:02:00', 'SANTOS', '', '');
    await insertEvent('ONEYSAOG05421700', 'SEGU4975077', 'CRG', 'Loaded on Vessel at Port of Loading', '2026-02-28 10:07:00', 'SANTOS', 'XIN CHANG SHA', '411N');
    await insertEvent('ONEYSAOG05421700', 'SEGU4975077', 'DEP', 'Vessel Departure from Port of Loading', '2026-02-28 10:07:00', 'SANTOS', 'XIN CHANG SHA', '411N');
    await updateMain('ONEYSAOG05421700', { last_event: 'Vessel departed - SANTOS', navio: 'XIN CHANG SHA', container_status: 'DEP' });
    results.push({ mbl: 'ONEYSAOG05421700', status: 'ok', events: 4 });

    // --- HLCUSS5260238613 (listed under SEM INFORMAÇÃO but actually has ONEY ref) ---
    // User listed it under SEM INFORMAÇÃO, keep it as NAO_ENCONTRADO (already handled above)

    console.log('[batch6] ONEYSAOG done');

    await client.close();
    console.log('[batch6] Batch 6 complete:', results.length, 'MBLs processed');

    return new Response(JSON.stringify({
      success: true,
      batch: 6,
      updated_count: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error('[batch6] Error:', e);
    return new Response(JSON.stringify({ error: e.message, partial_results: results }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
