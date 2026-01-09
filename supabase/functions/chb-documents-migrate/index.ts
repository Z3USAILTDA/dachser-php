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
        // Convert ISO date to MySQL datetime format
        const createdAt = doc.created_at 
          ? new Date(doc.created_at).toISOString().slice(0, 19).replace('T', ' ')
          : new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Step 1: Check if file already exists in t_dachser_chb_files by filename
        const existingFile = await mariaClient.query(
          `SELECT id FROM t_dachser_chb_files WHERE filename = ? LIMIT 1`,
          [doc.filename]
        );

        let fileId: number;

        if (existingFile.length > 0) {
          fileId = existingFile[0].id;
          console.log(`File already exists: ${doc.filename} (id: ${fileId})`);
        } else {
          // Insert into t_dachser_chb_files
          const fileResult = await mariaClient.execute(
            `INSERT INTO t_dachser_chb_files 
             (filename, mime, size_bytes, sha256, rel_path, url, created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              doc.filename,
              doc.mime_type || 'application/pdf',
              doc.file_size || 0,
              null, // sha256 not available
              doc.file_url, // use URL as rel_path
              doc.file_url,
              createdAt,
            ]
          );
          fileId = fileResult.lastInsertId as number;
          results.files_migrated++;
          console.log(`Created file: ${doc.filename} (id: ${fileId})`);
        }

        // Step 2: Check if doc link already exists in t_dachser_chb_docs
        const existingDoc = await mariaClient.query(
          `SELECT id FROM t_dachser_chb_docs WHERE item_id = ? AND file_id = ? LIMIT 1`,
          [doc.item_id, fileId]
        );

        if (existingDoc.length > 0) {
          console.log(`Doc link already exists for item ${doc.item_id}, file ${fileId}`);
          results.skipped++;
          continue;
        }

        // Map doc_role to enum values
        let docRole = 'pre_alerta'; // default
        if (doc.doc_role) {
          const roleMap: Record<string, string> = {
            'pre_alerta': 'pre_alerta',
            'instrucao': 'instrucao',
            'di_rascunho': 'di_rascunho',
            'checklist': 'checklist',
          };
          docRole = roleMap[doc.doc_role] || 'pre_alerta';
        }

        // Insert into t_dachser_chb_docs
        await mariaClient.execute(
          `INSERT INTO t_dachser_chb_docs 
           (item_id, file_id, etapa, doc_role, version, is_active, created_at) 
           VALUES (?, ?, ?, ?, 1, 1, ?)`,
          [
            doc.item_id,
            fileId,
            doc.etapa || '1',
            docRole,
            createdAt,
          ]
        );
        results.docs_migrated++;
        console.log(`Created doc link: item ${doc.item_id} -> file ${fileId}`);

      } catch (docError: unknown) {
        const errorMsg = `Error migrating doc ${doc.id} (${doc.filename}): ${docError instanceof Error ? docError.message : String(docError)}`;
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
