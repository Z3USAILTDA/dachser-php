// Batch 6A — Sem informação (8) + Santos-Hamburg + Santos-Cartagena + Santos-Chicago (15 MBLs)
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

    console.log('[batch6a] Starting...');

    // SEM INFORMAÇÃO (8 MBLs)
    for (const mbl of ['HLCUIT1260305275','HLCUIT1260309210','HLCUPN4260353977','HLCUPN4260264788','HLCUSS5260218029','HLCUSS5260224404','HLCUSS5260224766','HLCUSS5260238551']) {
      await upd(mbl, { container_status: 'NAO_ENCONTRADO', last_event: 'Sem informação no armador' });
      results.push({ mbl, status: 'ok', info: 'sem_informacao' });
    }

    // HLCUSS5251266740
    await upd('HLCUSS5251266740', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5251266740');
    await ins('HLCUSS5251266740','HAMU2543634','GOE','Gate out empty','2026-01-23 12:48:00','SANTOS','Truck','');
    await ins('HLCUSS5251266740','HAMU2543634','ARR','Arrival in','2026-02-13 23:46:00','SANTOS','Truck','');
    await ins('HLCUSS5251266740','HAMU2543634','CRG','Loaded','2026-02-23 16:01:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5251266740','HAMU2543634','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','');
    await upd('HLCUSS5251266740', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266740', status: 'ok', events: 4 });

    // HLCUSS5251266750
    await upd('HLCUSS5251266750', { container: 'HAMU3133613', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5251266750');
    await ins('HLCUSS5251266750','HAMU3133613','GOE','Gate out empty','2026-01-24 02:16:00','SANTOS','Truck','');
    await ins('HLCUSS5251266750','HAMU3133613','ARR','Arrival in','2026-02-13 17:39:00','SANTOS','Truck','');
    await ins('HLCUSS5251266750','HAMU3133613','CRG','Loaded','2026-02-23 16:33:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5251266750','HAMU3133613','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5251266750', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266750', status: 'ok', events: 4 });

    // HLCUSS5251266761
    await upd('HLCUSS5251266761', { container: 'HAMU4743950', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5251266761');
    await ins('HLCUSS5251266761','HAMU4743950','GOE','Gate out empty','2026-01-24 02:19:00','SANTOS','Truck','');
    await ins('HLCUSS5251266761','HAMU4743950','ARR','Arrival in','2026-02-13 15:42:00','SANTOS','Truck','');
    await ins('HLCUSS5251266761','HAMU4743950','CRG','Loaded','2026-02-23 16:52:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5251266761','HAMU4743950','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5251266761', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266761', status: 'ok', events: 4 });

    // HLCUSS5251266772
    await upd('HLCUSS5251266772', { container: 'HAMU4518008', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5251266772');
    await ins('HLCUSS5251266772','HAMU4518008','GOE','Gate out empty','2026-01-27 09:48:00','SANTOS','Truck','');
    await ins('HLCUSS5251266772','HAMU4518008','ARR','Arrival in','2026-02-13 10:26:00','SANTOS','Truck','');
    await ins('HLCUSS5251266772','HAMU4518008','CRG','Loaded','2026-02-23 15:52:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5251266772','HAMU4518008','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5251266772', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5251266772', status: 'ok', events: 4 });

    // HLCUSS5260210685
    await upd('HLCUSS5260210685', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5260210685');
    await ins('HLCUSS5260210685','HAMU2543634','GOE','Gate out empty','2026-01-23 12:48:00','SANTOS','Truck','');
    await ins('HLCUSS5260210685','HAMU2543634','ARR','Arrival in','2026-02-13 23:46:00','SANTOS','Truck','');
    await ins('HLCUSS5260210685','HAMU2543634','CRG','Loaded','2026-02-23 16:01:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5260210685','HAMU2543634','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5260210685', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260210685', status: 'ok', events: 4 });

    // HLCUSS5260210696 (ETA 04-08, ARR)
    await upd('HLCUSS5260210696', { container: 'HAMU4249552', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await del('HLCUSS5260210696');
    await ins('HLCUSS5260210696','HAMU4249552','GOE','Gate out empty','2026-02-25 14:02:00','SANTOS','Truck','');
    await ins('HLCUSS5260210696','HAMU4249552','ARR','Arrival in','2026-03-06 12:56:00','SANTOS','Truck','');
    await upd('HLCUSS5260210696', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210696', status: 'ok', events: 2 });

    // HLCUSS5260210703
    await upd('HLCUSS5260210703', { container: 'HAMU2373158', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await del('HLCUSS5260210703');
    await ins('HLCUSS5260210703','HAMU2373158','GOE','Gate out empty','2026-02-25 13:15:00','SANTOS','Truck','');
    await ins('HLCUSS5260210703','HAMU2373158','ARR','Arrival in','2026-03-06 09:12:00','SANTOS','Truck','');
    await upd('HLCUSS5260210703', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210703', status: 'ok', events: 2 });

    // HLCUSS5260210714
    await upd('HLCUSS5260210714', { container: 'HAMU3017850', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await del('HLCUSS5260210714');
    await ins('HLCUSS5260210714','HAMU3017850','GOE','Gate out empty','2026-02-25 13:03:00','SANTOS','Truck','');
    await ins('HLCUSS5260210714','HAMU3017850','ARR','Arrival in','2026-03-07 06:33:00','SANTOS','Truck','');
    await upd('HLCUSS5260210714', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210714', status: 'ok', events: 2 });

    // HLCUSS5260210747
    await upd('HLCUSS5260210747', { container: 'HAMU2980763', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-04-08' });
    await del('HLCUSS5260210747');
    await ins('HLCUSS5260210747','HAMU2980763','GOE','Gate out empty','2026-02-25 16:36:00','SANTOS','Truck','');
    await ins('HLCUSS5260210747','HAMU2980763','ARR','Arrival in','2026-03-06 12:22:00','SANTOS','Truck','');
    await upd('HLCUSS5260210747', { last_event: 'Arrival in - SANTOS', container_status: 'ARR' });
    results.push({ mbl: 'HLCUSS5260210747', status: 'ok', events: 2 });

    // HLCUSS5260223489
    await upd('HLCUSS5260223489', { container: 'HAMU2543634', origem: 'SANTOS', destino: 'HAMBURG', eta: '2026-03-25' });
    await del('HLCUSS5260223489');
    await ins('HLCUSS5260223489','HAMU2543634','GOE','Gate out empty','2026-01-23 12:48:00','SANTOS','Truck','');
    await ins('HLCUSS5260223489','HAMU2543634','ARR','Arrival in','2026-02-13 23:46:00','SANTOS','Truck','');
    await ins('HLCUSS5260223489','HAMU2543634','CRG','Loaded','2026-02-23 16:01:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5260223489','HAMU2543634','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5260223489', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260223489', status: 'ok', events: 4 });

    // HLCUSS5260223507 (Cartagena)
    await upd('HLCUSS5260223507', { container: 'HAMU1054080', origem: 'SANTOS', destino: 'CARTAGENA', eta: '2026-03-13' });
    await del('HLCUSS5260223507');
    await ins('HLCUSS5260223507','HAMU1054080','GOE','Gate out empty','2026-02-18 15:08:00','SANTOS','Truck','');
    await ins('HLCUSS5260223507','HAMU1054080','ARR','Arrival in','2026-02-27 05:05:00','SANTOS','Truck','');
    await ins('HLCUSS5260223507','HAMU1054080','CRG','Loaded','2026-03-02 01:25:00','SANTOS','COSTA RICA EXPRESS','2602N');
    await ins('HLCUSS5260223507','HAMU1054080','DEP','Vessel departed','2026-03-02 14:38:00','SANTOS','COSTA RICA EXPRESS','2602N');
    await upd('HLCUSS5260223507', { last_event: 'Vessel departed - SANTOS', navio: 'COSTA RICA EXPRESS', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260223507', status: 'ok', events: 4 });

    // HLCUSS5260224554 (Cartagena)
    await upd('HLCUSS5260224554', { container: 'FCIU4520417', origem: 'SANTOS', destino: 'CARTAGENA', eta: '2026-03-25' });
    await del('HLCUSS5260224554');
    await ins('HLCUSS5260224554','FCIU4520417','GOE','Gate out empty','2026-01-23 12:48:00','SANTOS','Truck','');
    await ins('HLCUSS5260224554','FCIU4520417','ARR','Arrival in','2026-02-13 23:46:00','SANTOS','Truck','');
    await ins('HLCUSS5260224554','FCIU4520417','CRG','Loaded','2026-02-23 16:01:00','SANTOS','MSC MUGE','NA607R');
    await ins('HLCUSS5260224554','FCIU4520417','DEP','Vessel departed','2026-02-24 10:10:00','SANTOS','MSC MUGE','NA607R');
    await upd('HLCUSS5260224554', { last_event: 'Vessel departed - SANTOS', navio: 'MSC MUGE', container_status: 'DEP' });
    results.push({ mbl: 'HLCUSS5260224554', status: 'ok', events: 4 });

    // HLCUSS5260232544 (Chicago)
    await upd('HLCUSS5260232544', { container: 'HAMU1439754', origem: 'SANTOS', destino: 'CHICAGO', eta: '2026-04-12' });
    await del('HLCUSS5260232544');
    await ins('HLCUSS5260232544','HAMU1439754','GOE','Gate out empty','2026-02-27 12:05:00','SANTOS','Truck','');
    await upd('HLCUSS5260232544', { last_event: 'Gate out empty - SANTOS', container_status: 'GOE' });
    results.push({ mbl: 'HLCUSS5260232544', status: 'ok', events: 1 });

    await conn.end();
    console.log('[batch6a] Done:', results.length, 'MBLs');
    return new Response(JSON.stringify({ success: true, batch: '6a', updated_count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error('[batch6a] Error:', e);
    return new Response(JSON.stringify({ error: e.message, partial_results: results }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
