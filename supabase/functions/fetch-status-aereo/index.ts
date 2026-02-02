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

    // Date filter for t_master_dados.data_insert
    const dateFilter = '2026-01-26';

    // OPTIMIZATION: Use subquery instead of JOIN to avoid full table scan
    // Step 1: Get MAWBs from t_master_dados for the specific date
    // Step 2: Use those MAWBs in a WHERE IN clause on t_status_aereo
    // REGRA: AWBs com "ARR - Destino" permanecem na lista por 5 dias após arr_datetime
    const baseSelect = `
      SELECT s.id, s.awb, s.hawb, s.destinatário, s.nome_analista, s.email_analista,
             s.email_cliente, s.tipo_servico, s.data_atraso, s.\`última atualização\`,
             s.\`último_status\`, s.origem, s.destino, s.alert_status, s.dep_datetime,
             ${hasArrCheckColumn ? 's.arr_check_count' : '0 as arr_check_count'},
             ${hasArrDatetimeColumn ? 's.arr_datetime' : 'NULL as arr_datetime'}
      FROM ${database}.t_status_aereo s
      WHERE (
        -- AWBs do dia atual (regra padrão)
        s.awb IN (
          SELECT m.mawb FROM ${database}.t_master_dados m 
          WHERE DATE(m.data_insert) = ?
          AND m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
        )
        -- OU AWBs com "ARR - Destino" que ainda estão dentro dos 5 dias
        ${hasArrDatetimeColumn ? `
        OR (
          s.\`último_status\` IN ('ARR', 'ARR - Destino')
          AND s.arr_datetime IS NOT NULL
          AND s.arr_datetime >= DATE_SUB(NOW(), INTERVAL 5 DAY)
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
      params = [dateFilter, searchPattern, searchPattern, searchPattern];
    } else {
      query = `${baseSelect} ORDER BY s.id DESC LIMIT 500`;
      params = [dateFilter];
    }

    console.log(`Executing query: ${query} (hasArrCheckColumn: ${hasArrCheckColumn})`);
    const rows = await client.query(query, params);
    
    console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} records from t_status_aereo`);

    // Convert dates to local format without Z suffix (MariaDB stores in São Paulo timezone)
    const processedRows = (rows || []).map((row: any) => {
      const processed = { ...row };
      
      // Convert última atualização - remove Z suffix to treat as local time
      if (processed['última atualização']) {
        const dateStr = String(processed['última atualização']);
        // If it ends with Z or has timezone, remove it to keep as local time
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
