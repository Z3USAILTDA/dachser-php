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
    console.log('Adding email_cliente column to t_status_aereo');

    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST') || '',
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER') || '',
      password: Deno.env.get('MARIADB_PASSWORD') || '',
      db: Deno.env.get('MARIADB_DATABASE') || '',
    });

    console.log('Connected to MariaDB');

    // Check if column already exists
    const checkColumns = await client.query(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_status_aereo' 
       AND COLUMN_NAME = 'email_cliente'`,
      [Deno.env.get('MARIADB_DATABASE')]
    );

    const columnExists = checkColumns.length > 0;
    
    // Add email_cliente column if it doesn't exist
    if (!columnExists) {
      console.log('Adding email_cliente column...');
      await client.execute(
        `ALTER TABLE t_status_aereo ADD COLUMN email_cliente VARCHAR(255) DEFAULT NULL AFTER nome_analista`
      );
      console.log('Column email_cliente added successfully');
    } else {
      console.log('Column email_cliente already exists');
    }

    await client.close();

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: columnExists ? 'Column already exists' : 'Column added successfully',
        added: !columnExists
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error adding column:', error);
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
