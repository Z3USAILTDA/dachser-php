import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Initialize MariaDB client
    const mariaClient = await new Client().connect({
      hostname: Deno.env.get('MARIADB_HOST'),
      port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
      username: Deno.env.get('MARIADB_USER'),
      password: Deno.env.get('MARIADB_PASSWORD'),
      db: 'ai_agente',
    });

    // Fetch all chb_documents from Supabase
    const { data: documents, error: fetchError } = await supabase
      .from('chb_documents')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch chb_documents: ${fetchError.message}`);
    }

    console.log(`Found ${documents?.length || 0} documents to migrate`);

    const results = {
      total: documents?.length || 0,
      files_migrated: 0,
      docs_migrated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const doc of documents || []) {
      try {
        // Check if already migrated to t_dachser_chb_files
        const existingFile = await mariaClient.query(
          `SELECT id FROM t_dachser_chb_files WHERE supabase_id = ? LIMIT 1`,
          [doc.id]
        );

        if (existingFile.length > 0) {
          console.log(`Skipping already migrated document: ${doc.id}`);
          results.skipped++;
          continue;
        }

        // Convert ISO date to MySQL datetime format
        const createdAt = doc.created_at 
          ? new Date(doc.created_at).toISOString().slice(0, 19).replace('T', ' ')
          : new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Insert into t_dachser_chb_files
        const fileInsertResult = await mariaClient.execute(
          `INSERT INTO t_dachser_chb_files 
           (item_id, filename, etapa, doc_role, mime, size_bytes, url, created_at, supabase_id) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            doc.item_id,
            doc.filename,
            doc.etapa || '1',
            doc.doc_role || 'documento',
            doc.mime_type || 'application/pdf',
            doc.file_size || 0,
            doc.file_url,
            createdAt,
            doc.id, // Store original Supabase ID for reference
          ]
        );

        results.files_migrated++;
        console.log(`Migrated file: ${doc.filename} (item_id: ${doc.item_id})`);

        // Also insert a placeholder run in t_dachser_chb_docs if needed
        // This represents that the document was uploaded but may not have been analyzed
        const existingDoc = await mariaClient.query(
          `SELECT id FROM t_dachser_chb_docs WHERE item_id = ? AND etapa = ? AND filename = ? LIMIT 1`,
          [doc.item_id, doc.etapa || '1', doc.filename]
        );

        if (existingDoc.length === 0) {
          await mariaClient.execute(
            `INSERT INTO t_dachser_chb_docs 
             (item_id, etapa, filename, raw_text, extracted_json, created_at, supabase_doc_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              doc.item_id,
              doc.etapa || '1',
              doc.filename,
              null, // raw_text - will be filled during analysis
              '{}', // extracted_json - empty placeholder
              createdAt,
              doc.id,
            ]
          );
          results.docs_migrated++;
        }

      } catch (docError: unknown) {
        const errorMsg = `Error migrating doc ${doc.id}: ${docError instanceof Error ? docError.message : String(docError)}`;
        console.error(errorMsg);
        results.errors.push(errorMsg);
      }
    }

    await mariaClient.close();

    return new Response(JSON.stringify({
      success: true,
      message: `Migration completed`,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Migration error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
