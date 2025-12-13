import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert ISO8601 to MySQL datetime format
function toMySQLDatetime(isoString: string | null): string | null {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    return date.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting migration from Supabase to MariaDB...');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize MariaDB connection
    const client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST')!,
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER')!,
      password: Deno.env.get('MARIADB_PASSWORD')!,
      db: 'ai_agente',
    });

    console.log('Connected to MariaDB');

    const results = {
      files: { migrated: 0, errors: 0, idMap: {} as Record<string, number> },
      items: { migrated: 0, errors: 0, idMap: {} as Record<string, number> },
      runs: { migrated: 0, errors: 0 },
    };

    // 1. Migrate maritime_files → t_dachser_sea_files
    console.log('Fetching maritime_files from Supabase...');
    const { data: files, error: filesError } = await supabase
      .from('maritime_files')
      .select('*');

    if (filesError) throw new Error(`Error fetching files: ${filesError.message}`);
    console.log(`Found ${files?.length || 0} files to migrate`);

    for (const file of files || []) {
      try {
        const insertResult = await client.execute(
          `INSERT INTO t_dachser_sea_files (filename, mime, size_bytes, sha256, rel_path, url, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            file.file_name || 'unknown.pdf',
            file.file_type || 'application/pdf',
            file.file_size || 0,
            '',
            file.file_url || '',
            file.file_url || '',
            toMySQLDatetime(file.created_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')
          ]
        );
        
        const lastId = insertResult.lastInsertId;
        if (lastId) {
          results.files.idMap[file.id] = Number(lastId);
        }
        results.files.migrated++;
      } catch (err) {
        console.error(`Error migrating file ${file.id}:`, err);
        results.files.errors++;
      }
    }

    console.log(`Files migrated: ${results.files.migrated}, errors: ${results.files.errors}`);

    // 2. Migrate maritime_items → t_dachser_sea_items
    console.log('Fetching maritime_items from Supabase...');
    const { data: items, error: itemsError } = await supabase
      .from('maritime_items')
      .select('*');

    if (itemsError) throw new Error(`Error fetching items: ${itemsError.message}`);
    console.log(`Found ${items?.length || 0} items to migrate`);

    for (const item of items || []) {
      try {
        // Create file record for base file
        const fileInsertResult = await client.execute(
          `INSERT INTO t_dachser_sea_files (filename, mime, rel_path, url, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [
            item.base_file_name || 'base.pdf',
            'application/pdf',
            item.base_file_url || '',
            item.base_file_url || '',
            toMySQLDatetime(item.created_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')
          ]
        );
        
        const arquivoId = fileInsertResult.lastInsertId;
        if (!arquivoId) {
          console.error(`Could not create file for item ${item.id}`);
          results.items.errors++;
          continue;
        }

        let viewValue = item.analysis_type || 'manifest_hbl';
        if (viewValue === 'invoices_hbl') {
          viewValue = 'invoice_hbl';
        }
        
        const statusValue = item.status === 'completed' || item.status === 'realizado' ? 'realizado' : 'pendente';

        const itemInsertResult = await client.execute(
          `INSERT INTO t_dachser_sea_items (view, arquivo_id, arquivo_label, consignee, container, status, active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            viewValue,
            arquivoId,
            (item.base_file_name || 'base.pdf').substring(0, 50),
            item.consignee ? item.consignee.substring(0, 150) : null,
            item.container ? item.container.substring(0, 20) : null,
            statusValue,
            1,
            toMySQLDatetime(item.created_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')
          ]
        );
        
        const itemId = itemInsertResult.lastInsertId;
        if (itemId) {
          results.items.idMap[item.id] = Number(itemId);
        }
        results.items.migrated++;
      } catch (err) {
        console.error(`Error migrating item ${item.id}:`, err);
        results.items.errors++;
      }
    }

    console.log(`Items migrated: ${results.items.migrated}, errors: ${results.items.errors}`);

    // 3. Migrate maritime_analyses → t_dachser_sea_runs
    console.log('Fetching maritime_analyses from Supabase...');
    const { data: analyses, error: analysesError } = await supabase
      .from('maritime_analyses')
      .select('*');

    if (analysesError) throw new Error(`Error fetching analyses: ${analysesError.message}`);
    console.log(`Found ${analyses?.length || 0} analyses to migrate`);

    for (const analysis of analyses || []) {
      try {
        const mariaItemId = results.items.idMap[analysis.item_id];
        
        if (!mariaItemId) {
          console.log(`Skipping analysis ${analysis.id} - no mapped item_id`);
          results.runs.errors++;
          continue;
        }

        let resultText = '';
        if (analysis.result_data) {
          const rd = analysis.result_data as any;
          resultText = rd.result_text || rd.text || rd.resposta || JSON.stringify(rd);
        }

        const modeValue = analysis.analysis_type || 'manifest_hbl';

        await client.execute(
          `INSERT INTO t_dachser_sea_runs (item_id, mode, thread_id, run_id, status, result_text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            mariaItemId,
            modeValue,
            null,
            analysis.id.substring(0, 80),
            analysis.status ? analysis.status.substring(0, 40) : 'pendente',
            resultText,
            toMySQLDatetime(analysis.created_at) || new Date().toISOString().slice(0, 19).replace('T', ' ')
          ]
        );
        results.runs.migrated++;
      } catch (err) {
        console.error(`Error migrating analysis ${analysis.id}:`, err);
        results.runs.errors++;
      }
    }

    await client.close();

    console.log('Migration completed:', results);

    return new Response(JSON.stringify({
      success: true,
      message: 'Migration completed successfully',
      results: {
        files: { migrated: results.files.migrated, errors: results.files.errors },
        items: { migrated: results.items.migrated, errors: results.items.errors },
        runs: { migrated: results.runs.migrated, errors: results.runs.errors },
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Migration error:', errorMessage);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
