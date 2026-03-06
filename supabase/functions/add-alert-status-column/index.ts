import mysql from "npm:mysql2@3.11.3/promise";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let connection;
  try {
    console.log('Connecting to MariaDB to manage data_atraso column...');

    connection = await mysql.createConnection({
      host: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      user: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      database: Deno.env.get('MARIADB_DATABASE') || '',
      connectTimeout: 10000,
    });

    console.log('Connected to MariaDB');
    const db = Deno.env.get('MARIADB_DATABASE');

    // Check if old column exists and rename/change type
    const [checkOldColumn] = await connection.query(
      `SELECT COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' 
       AND COLUMN_NAME = 'had_alert_status'`,
      [db]
    );

    if ((checkOldColumn as any[]).length > 0) {
      console.log('Renaming had_alert_status to data_atraso and changing type to DATETIME...');
      await connection.execute(
        `ALTER TABLE t_status_aereo CHANGE COLUMN had_alert_status data_atraso DATETIME DEFAULT NULL`
      );
      console.log('Column renamed and type changed successfully');
    } else {
      const [checkNewColumn] = await connection.query(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' 
         AND COLUMN_NAME = 'data_atraso'`,
        [db]
      );

      if ((checkNewColumn as any[]).length === 0) {
        console.log('Adding data_atraso column to t_status_aereo...');
        await connection.execute(
          `ALTER TABLE t_status_aereo ADD COLUMN data_atraso DATETIME DEFAULT NULL AFTER email_cliente`
        );
        console.log('Column data_atraso added successfully');
      } else {
        console.log('Column data_atraso already exists');
      }
    }

    await connection.end();

    return new Response(
      JSON.stringify({ success: true, message: 'Column data_atraso verified/added' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error managing data_atraso column:', error);
    if (connection) try { await connection.end(); } catch (_) {}
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
