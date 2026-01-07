import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert various date formats to MySQL datetime format (YYYY-MM-DD HH:MM:SS)
function formatDateTimeForMySQL(dateStr: string | null): string | null {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch {
    return null;
  }
}

interface TrackingData {
  mbl_id: string;
  booking: string | null;
  origem: string | null;
  destino: string | null;
  navio: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  tipo_processo: string | null;
  status_armador: string | null;
  transaction_id: string | null;
  hash_hapag_lloyd: string | null;
  api_endpoint: string | null;
  data_hora_servidor: string | null;
  data_hora_consulta: string | null;
}

// Default value for tipo_processo when not provided
const DEFAULT_TIPO_PROCESSO = 'MARITIMO';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('Starting save tracking to MariaDB...');

  let mariaClient: Client | null = null;

  try {
    const body = await req.json();
    const trackingData: TrackingData = body.trackingData;

    if (!trackingData || !trackingData.mbl_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tracking data with mbl_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Received tracking data for MBL:', trackingData.mbl_id);

    // Get MariaDB credentials from environment
    const mariadbHost = Deno.env.get('MARIADB_HOST');
    const mariadbPort = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const mariadbUser = Deno.env.get('MARIADB_USER');
    const mariadbPassword = Deno.env.get('MARIADB_PASSWORD');
    const mariadbDatabase = Deno.env.get('MARIADB_DATABASE');

    if (!mariadbHost || !mariadbUser || !mariadbPassword || !mariadbDatabase) {
      throw new Error('MariaDB credentials not configured');
    }

    console.log(`Connecting to MariaDB at ${mariadbHost}:${mariadbPort}...`);

    // Connect to MariaDB
    mariaClient = await new Client().connect({
      hostname: mariadbHost,
      port: mariadbPort,
      username: mariadbUser,
      password: mariadbPassword,
      db: mariadbDatabase,
    });

    console.log('Connected to MariaDB successfully');

    // Check if record already exists
    const existingQuery = `
      SELECT id FROM dados_dachser.t_consulta_armador 
      WHERE mbl_id = ?
      LIMIT 1
    `;
    const existing = await mariaClient.query(existingQuery, [trackingData.mbl_id]);

    if (existing && existing.length > 0) {
      // Update existing record
      console.log('Updating existing record for MBL:', trackingData.mbl_id);
      
      const updateQuery = `
        UPDATE dados_dachser.t_consulta_armador SET
          booking = ?,
          origem = ?,
          destino = ?,
          navio = ?,
          voyage = ?,
          etd = ?,
          eta = ?,
          tipo_processo = ?,
          status_armador = ?,
          transaction_id = ?,
          hash_hapag_lloyd = ?,
          api_endpoint = ?,
          data_hora_servidor = ?,
          data_hora_consulta = ?
        WHERE mbl_id = ?
      `;

      await mariaClient.execute(updateQuery, [
        trackingData.booking,
        trackingData.origem,
        trackingData.destino,
        trackingData.navio,
        trackingData.voyage,
        trackingData.etd,
        trackingData.eta,
        trackingData.tipo_processo || DEFAULT_TIPO_PROCESSO,
        trackingData.status_armador,
        trackingData.transaction_id,
        trackingData.hash_hapag_lloyd,
        trackingData.api_endpoint,
        formatDateTimeForMySQL(trackingData.data_hora_servidor),
        formatDateTimeForMySQL(trackingData.data_hora_consulta),
        trackingData.mbl_id
      ]);

      console.log('Record updated successfully');
    } else {
      // Insert new record
      console.log('Inserting new record for MBL:', trackingData.mbl_id);

      const insertQuery = `
        INSERT INTO dados_dachser.t_consulta_armador (
          mbl_id,
          booking,
          origem,
          destino,
          navio,
          voyage,
          etd,
          eta,
          tipo_processo,
          status_armador,
          transaction_id,
          hash_hapag_lloyd,
          api_endpoint,
          data_hora_servidor,
          data_hora_consulta,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      await mariaClient.execute(insertQuery, [
        trackingData.mbl_id,
        trackingData.booking,
        trackingData.origem,
        trackingData.destino,
        trackingData.navio,
        trackingData.voyage,
        trackingData.etd,
        trackingData.eta,
        trackingData.tipo_processo || DEFAULT_TIPO_PROCESSO,
        trackingData.status_armador,
        trackingData.transaction_id,
        trackingData.hash_hapag_lloyd,
        trackingData.api_endpoint,
        formatDateTimeForMySQL(trackingData.data_hora_servidor),
        formatDateTimeForMySQL(trackingData.data_hora_consulta)
      ]);

      console.log('Record inserted successfully');
    }

    // Close MariaDB connection
    await mariaClient.close();
    mariaClient = null;
    console.log('Closed MariaDB connection');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Tracking data saved for MBL: ${trackingData.mbl_id}`,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Save tracking error:', error);

    // Ensure connection is closed on error
    if (mariaClient) {
      try {
        await mariaClient.close();
      } catch (closeErr) {
        console.error('Error closing MariaDB connection:', closeErr);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
