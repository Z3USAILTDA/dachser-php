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

  try {
    console.log('Connecting to MariaDB to manage data_atraso column...');
    
    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Check if old column exists and rename/change type
    const checkOldColumn = await client.query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' 
       AND COLUMN_NAME = 'had_alert_status'`,
      [Deno.env.get('MARIADB_DATABASE')]
    );

    if (checkOldColumn.length > 0) {
      console.log('Renaming had_alert_status to data_atraso and changing type to DATETIME...');
      await client.execute(
        `ALTER TABLE t_status_aereo CHANGE COLUMN had_alert_status data_atraso DATETIME DEFAULT NULL`
      );
      console.log('Column renamed and type changed successfully');
    } else {
      // Check if new column already exists
      const checkNewColumn = await client.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' 
         AND COLUMN_NAME = 'data_atraso'`,
        [Deno.env.get('MARIADB_DATABASE')]
      );

      if (checkNewColumn.length === 0) {
        console.log('Adding data_atraso column to t_status_aereo...');
        await client.execute(
          `ALTER TABLE t_status_aereo ADD COLUMN data_atraso DATETIME DEFAULT NULL AFTER email_cliente`
        );
        console.log('Column data_atraso added successfully');
      } else {
        console.log('Column data_atraso already exists');
      }
    }

    await client.close();

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Column data_atraso verified/added'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error managing data_atraso column:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
