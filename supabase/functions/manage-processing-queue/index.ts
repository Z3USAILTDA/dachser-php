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
    const { action, mawb, limit = 100, offset = 0 } = body;

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

    client = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
    });

    console.log(`manage-processing-queue action: ${action}`);

    switch (action) {
      case 'create_table': {
        // Create table if not exists with all required columns
        await client.execute(`
          CREATE TABLE IF NOT EXISTS ${database}.t_awb_processing_queue (
            id INT AUTO_INCREMENT PRIMARY KEY,
            mawb VARCHAR(50) UNIQUE,
            hawb VARCHAR(255),
            destinatario VARCHAR(255),
            nome_analista VARCHAR(255),
            email_analista VARCHAR(255),
            origem VARCHAR(10) DEFAULT 'N/A',
            destino VARCHAR(10) DEFAULT 'N/A',
            email_cliente VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Add missing columns if they don't exist
        const columnsToAdd = [
          { name: 'origem', type: "VARCHAR(10) DEFAULT 'N/A'" },
          { name: 'destino', type: "VARCHAR(10) DEFAULT 'N/A'" },
          { name: 'email_cliente', type: 'VARCHAR(255)' },
          { name: 'email_analista', type: 'VARCHAR(255)' },
        ];

        for (const col of columnsToAdd) {
          try {
            await client.execute(`ALTER TABLE ${database}.t_awb_processing_queue ADD COLUMN ${col.name} ${col.type}`);
            console.log(`Added column ${col.name}`);
          } catch {
            // Column already exists, ignore error
          }
        }

        return new Response(
          JSON.stringify({ success: true, message: 'Table created/verified' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'populate': {
        // Populate queue with unprocessed AWBs from t_master_dados using anti-join
        const insertQuery = `
          INSERT IGNORE INTO ${database}.t_awb_processing_queue 
            (mawb, hawb, destinatario, nome_analista, email_analista, origem, destino)
          SELECT 
            TRIM(m.mawb) as mawb,
            MAX(TRIM(m.hawb)) as hawb,
            MAX(m.cliente) as destinatario,
            MAX(m.nome_analista) as nome_analista,
            MAX(m.email_analista) as email_analista,
            'N/A' as origem,
            'N/A' as destino
          FROM ${database}.t_master_dados m
          LEFT JOIN ${database}.t_status_aereo s ON TRIM(m.mawb) = TRIM(s.awb)
          WHERE m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
            AND m.mawb IS NOT NULL 
            AND TRIM(m.mawb) != ''
            AND LENGTH(TRIM(m.mawb)) >= 3
            AND s.awb IS NULL
          GROUP BY TRIM(m.mawb)
        `;

        const result = await client.execute(insertQuery);
        console.log(`Populated queue with ${result.affectedRows || 0} new AWBs`);

        return new Response(
          JSON.stringify({ success: true, inserted: result.affectedRows || 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'fetch': {
        const query = `
          SELECT 
            id,
            TRIM(mawb) as mawb,
            TRIM(hawb) as hawb,
            destinatario,
            nome_analista,
            email_analista,
            origem,
            destino,
            email_cliente,
            created_at
          FROM ${database}.t_awb_processing_queue
          ORDER BY id ASC
          LIMIT ? OFFSET ?
        `;

        const rows = await client.query(query, [limit, offset]);
        console.log(`Fetched ${Array.isArray(rows) ? rows.length : 0} AWBs from queue`);

        return new Response(
          JSON.stringify({ success: true, data: rows }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'remove': {
        if (!mawb) {
          return new Response(
            JSON.stringify({ success: false, error: 'mawb is required for remove action' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const sanitizedMawb = mawb.toString().trim();

        // Verify existence before delete
        const beforeCheck = await client.query(
          `SELECT COUNT(*) as cnt FROM ${database}.t_awb_processing_queue WHERE TRIM(mawb) = ?`,
          [sanitizedMawb]
        );
        console.log(`Before delete - AWB ${sanitizedMawb} exists: ${beforeCheck[0]?.cnt > 0}`);

        // Delete the AWB
        const deleteResult = await client.execute(
          `DELETE FROM ${database}.t_awb_processing_queue WHERE TRIM(mawb) = ?`,
          [sanitizedMawb]
        );

        // Verify after delete
        const afterCheck = await client.query(
          `SELECT COUNT(*) as cnt FROM ${database}.t_awb_processing_queue WHERE TRIM(mawb) = ?`,
          [sanitizedMawb]
        );
        console.log(`After delete - AWB ${sanitizedMawb} exists: ${afterCheck[0]?.cnt > 0}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            deleted: deleteResult.affectedRows || 0,
            mawb: sanitizedMawb 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'clear': {
        await client.execute(`TRUNCATE TABLE ${database}.t_awb_processing_queue`);
        console.log('Queue cleared');

        return new Response(
          JSON.stringify({ success: true, message: 'Queue cleared' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'count': {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM ${database}.t_awb_processing_queue`
        );

        return new Response(
          JSON.stringify({ success: true, count: countResult[0]?.total || 0 }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in manage-processing-queue:', errorMessage);
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
