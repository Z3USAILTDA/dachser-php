import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const body = await req.json();
    const { search } = body;

    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      console.error('Missing database credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'Database configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} for fetch-status-aereo (t_aereo_ws primary)`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // ========== PASSO 1: Buscar snapshots mais recentes de t_aereo_ws ==========
    let wsQuery: string;
    let wsParams: string[] = [];

    const baseWsQuery = `
      SELECT w.id, w.awb, w.last_status_code, w.last_status_description,
             w.origin, w.destination, w.last_flight, w.scraped_at,
             w.sidebar_days_in_transit
      FROM ${database}.t_aereo_ws w
      INNER JOIN (
        SELECT awb, MAX(id) as max_id
        FROM ${database}.t_aereo_ws
        GROUP BY awb
      ) latest ON w.id = latest.max_id
    `;

    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      wsQuery = `${baseWsQuery}
        WHERE (w.awb LIKE ? OR w.last_status_code LIKE ? OR w.last_status_description LIKE ?)
        ORDER BY w.scraped_at DESC
        LIMIT 500`;
      wsParams = [searchPattern, searchPattern, searchPattern];
    } else {
      wsQuery = `${baseWsQuery} ORDER BY w.scraped_at DESC LIMIT 500`;
    }

    console.log('Fetching latest snapshots from t_aereo_ws...');
    const wsRows = await client.query(wsQuery, wsParams);
    const wsList = Array.isArray(wsRows) ? wsRows : [];
    console.log(`Found ${wsList.length} AWBs from t_aereo_ws`);

    if (wsList.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== PASSO 2: Enriquecer com dados de t_master_dados ==========
    const awbsFromWs = wsList.map((r: any) => String(r.awb || '').trim()).filter(Boolean);
    const uniqueAwbs = [...new Set(awbsFromWs)];
    const awbInClause = uniqueAwbs.map(a => `'${a.replace(/'/g, "''")}'`).join(',');

    const masterQuery = `
      SELECT DISTINCT TRIM(mawb) as mawb, TRIM(hawb) as hawb, 
             cliente, nome_analista, email_analista, emails_cliente,
             tipo_processo, tipo_servico
      FROM ${database}.t_master_dados
      WHERE TRIM(mawb) COLLATE utf8mb4_unicode_ci IN (${awbInClause})
        AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
      ORDER BY data_insert DESC
    `;

    console.log(`Enriching with t_master_dados for ${uniqueAwbs.length} AWBs...`);
    const masterRows = await client.query(masterQuery);
    const masterList = Array.isArray(masterRows) ? masterRows : [];
    console.log(`Found ${masterList.length} enrichment records from t_master_dados`);

    // Build lookup map: MAWB -> master data (use first/most recent match)
    const masterMap = new Map<string, any>();
    for (const row of masterList) {
      const mawb = String(row.mawb || '').trim();
      if (mawb && !masterMap.has(mawb)) {
        masterMap.set(mawb, row);
      }
    }

    // ========== PASSO 3: Merge em memória ==========
    const processedRows = wsList.map((ws: any) => {
      const awb = String(ws.awb || '').trim();
      const master = masterMap.get(awb);

      // Convert scraped_at - remove Z suffix to treat as local time
      let scrapedAt = ws.scraped_at ? String(ws.scraped_at) : null;
      if (scrapedAt) {
        scrapedAt = scrapedAt.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }

      return {
        id: ws.id,
        awb: awb,
        hawb: master ? String(master.hawb || '').trim() : null,
        destinatário: master ? (master.cliente || null) : null,
        nome_analista: master ? (master.nome_analista || null) : null,
        email_analista: master ? (master.email_analista || null) : null,
        email_cliente: master ? (master.emails_cliente || null) : null,
        tipo_servico: master ? (master.tipo_servico || null) : null,
        tipo_processo: master ? (master.tipo_processo || null) : null,
        origem: ws.origin || null,
        destino: ws.destination || null,
        último_status: ws.last_status_code || null,
        status_info: ws.last_status_description || null,
        'última atualização': scrapedAt,
        last_flight: ws.last_flight || null,
        days_in_transit: ws.sidebar_days_in_transit || null,
      };
    });

    // Debug: log distribution
    const importCount = processedRows.filter((r: any) => r.tipo_processo === 'AIR IMPORT').length;
    const exportCount = processedRows.filter((r: any) => r.tipo_processo === 'AIR EXPORT').length;
    const nullCount = processedRows.filter((r: any) => !r.tipo_processo).length;
    console.log(`tipo_processo distribution: IMPORT=${importCount}, EXPORT=${exportCount}, null=${nullCount}`);

    return new Response(
      JSON.stringify({ success: true, data: processedRows }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in fetch-status-aereo:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
});
