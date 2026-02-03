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

    console.log(`Connecting to MariaDB at ${host}:${port}/${database} for fetch-status-aereo`);
    
    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    // Check if arr_check_count and arr_datetime columns exist
    let hasArrCheckColumn = false;
    let hasArrDatetimeColumn = false;
    try {
      const colCheck = await client.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' AND COLUMN_NAME IN ('arr_check_count', 'arr_datetime')`,
        [database]
      );
      if (Array.isArray(colCheck)) {
        hasArrCheckColumn = colCheck.some((r: any) => r.COLUMN_NAME === 'arr_check_count');
        hasArrDatetimeColumn = colCheck.some((r: any) => r.COLUMN_NAME === 'arr_datetime');
      }
    } catch (e) {
      console.log('Column check failed, assuming columns do not exist');
    }

    // OTIMIZAÇÃO: Primeiro buscar lista de MAWBs válidos e mapear HAWB -> tipo_processo
    // Usamos HAWB como chave pois t_status_aereo.hawb corresponde a t_master_dados.hawb
    const mawbListQuery = `
      SELECT DISTINCT TRIM(mawb) as mawb, TRIM(hawb) as hawb, tipo_processo
      FROM ${database}.t_master_dados 
      WHERE data_insert >= DATE_SUB(NOW(), INTERVAL 10 DAY)
      AND tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
      AND mawb IS NOT NULL AND TRIM(mawb) != ''
    `;
    
    const mawbListResult = await client.query(mawbListQuery);
    const mawbList = Array.isArray(mawbListResult) ? mawbListResult : [];
    
    // Criar mapas para lookup eficiente
    // mawbToProcessType: MAWB -> tipo_processo (para busca por AWB)
    // hawbToProcessType: HAWB -> tipo_processo (para busca por HAWB quando AWB não bater)
    const mawbToProcessType = new Map<string, string>();
    const hawbToProcessType = new Map<string, string>();
    const validMawbs: string[] = [];
    
    for (const row of mawbList) {
      const mawb = String(row.mawb || '').trim();
      const hawb = String(row.hawb || '').trim();
      
      if (mawb) {
        validMawbs.push(mawb);
        if (row.tipo_processo) {
          mawbToProcessType.set(mawb, row.tipo_processo);
        }
      }
      
      // Também mapear por HAWB para correlação alternativa
      if (hawb && row.tipo_processo) {
        hawbToProcessType.set(hawb, row.tipo_processo);
      }
    }
    
    console.log(`Built maps: ${mawbToProcessType.size} MAWBs, ${hawbToProcessType.size} HAWBs`)

    console.log(`Found ${validMawbs.length} valid MAWBs from t_master_dados`);

    // Se não houver MAWBs válidos, retorna vazio (evita query pesada)
    if (validMawbs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, data: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Construir lista para WHERE IN (escapar aspas simples)
    const mawbInClause = validMawbs.map(m => `'${m.replace(/'/g, "''")}'`).join(',');

    // Query principal usando lista explícita (muito mais rápido que subquery)
    const baseSelect = `
      SELECT s.id, s.awb, s.hawb, s.destinatário, s.nome_analista, s.email_analista,
             s.email_cliente, s.tipo_servico, s.data_atraso, s.\`última atualização\`,
             s.\`último_status\`, s.origem, s.destino, s.alert_status, s.dep_datetime,
             ${hasArrCheckColumn ? 's.arr_check_count' : '0 as arr_check_count'},
             ${hasArrDatetimeColumn ? 's.arr_datetime' : 'NULL as arr_datetime'}
      FROM ${database}.t_status_aereo s
      WHERE (
        s.awb IN (${mawbInClause})
        ${hasArrDatetimeColumn ? `
        OR (
          s.\`último_status\` IN ('ARR', 'ARR - Destino')
          AND COALESCE(s.arr_datetime, s.\`última atualização\`) >= DATE_SUB(NOW(), INTERVAL 5 DAY)
        )` : ''}
      )`;

    let query: string;
    let params: string[];

    if (search && search.trim() !== '') {
      const searchPattern = `%${search.trim()}%`;
      query = `${baseSelect}
        AND (s.awb LIKE ? OR s.hawb LIKE ? OR s.destinatário LIKE ?)
        ORDER BY s.id DESC
        LIMIT 500`;
      params = [searchPattern, searchPattern, searchPattern];
    } else {
      query = `${baseSelect} ORDER BY s.id DESC LIMIT 500`;
      params = [];
    }

    console.log(`Executing optimized query with ${validMawbs.length} MAWBs in IN clause`);
    const rows = await client.query(query, params);
    
    console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} records from t_status_aereo`);

    // Debug: log some sample AWBs and their mappings
    let matchedCount = 0;
    let unmatchedSamples: string[] = [];

    // Convert dates to local format and add tipo_processo from lookup map
    const processedRows = (rows || []).map((row: any) => {
      const processed = { ...row };
      
      // Add tipo_processo from the pre-fetched maps
      // Tentar primeiro por AWB (MAWB), depois por HAWB
      const awbTrimmed = String(processed.awb || '').trim();
      const hawbTrimmed = String(processed.hawb || '').trim();
      
      // Primeiro tenta mapear pelo AWB (que corresponde ao MAWB)
      let tipoProcesso = mawbToProcessType.get(awbTrimmed);
      
      // Se não encontrou pelo AWB, tenta pelo HAWB
      if (!tipoProcesso && hawbTrimmed) {
        tipoProcesso = hawbToProcessType.get(hawbTrimmed);
      }
      
      if (tipoProcesso) {
        matchedCount++;
        processed.tipo_processo = tipoProcesso;
      } else {
        processed.tipo_processo = null;
        if (unmatchedSamples.length < 5) {
          unmatchedSamples.push(`awb:${awbTrimmed}/hawb:${hawbTrimmed}`);
        }
      }
      
      // Convert última atualização - remove Z suffix to treat as local time
      if (processed['última atualização']) {
        const dateStr = String(processed['última atualização']);
        processed['última atualização'] = dateStr.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }
      
      // Convert arr_datetime
      if (processed.arr_datetime) {
        const dateStr = String(processed.arr_datetime);
        processed.arr_datetime = dateStr.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }
      
      // Convert dep_datetime
      if (processed.dep_datetime) {
        const dateStr = String(processed.dep_datetime);
        processed.dep_datetime = dateStr.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }
      
      // Convert data_atraso - ensure it's passed correctly to frontend
      if (processed.data_atraso) {
        const dateStr = String(processed.data_atraso);
        processed.data_atraso = dateStr.replace(/Z$/, '').replace(/\.\d{3}Z$/, '');
      }
      
      return processed;
    });

    console.log(`tipo_processo mapping: ${matchedCount}/${processedRows.length} matched`);
    if (unmatchedSamples.length > 0) {
      console.log(`Unmatched AWB samples: ${unmatchedSamples.join(', ')}`);
    }

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
