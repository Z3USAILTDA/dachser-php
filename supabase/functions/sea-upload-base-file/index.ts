import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract container from filename as fallback
function extractContainerFromFilename(fileName: string): string | null {
  const match = fileName.match(/\b([A-Z]{4}\d{7})\b/);
  return match?.[1] || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let dbClient: Client | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const analysisType = formData.get('analysisType') as string;

    if (!file || !analysisType) {
      return new Response(
        JSON.stringify({ error: 'File and analysisType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[UPLOAD] Uploading base file: ${file.name}, type: ${analysisType}`);

    // Read file buffer for upload
    const fileBuffer = await file.arrayBuffer();

    // Upload file to Supabase Storage
    const storagePath = `base-files/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('maritime-files')
      .upload(storagePath, fileBuffer, { contentType: file.type });

    if (uploadError) {
      console.error('[UPLOAD] Storage upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('maritime-files')
      .getPublicUrl(storagePath);

    console.log('[UPLOAD] File uploaded to storage, saving to MariaDB...');

    // Extract container from filename
    const containerFromFilename = extractContainerFromFilename(file.name);
    console.log(`[UPLOAD] Container from filename: ${containerFromFilename || 'not found'}`);

    // Connect to MariaDB
    const host = Deno.env.get('MARIADB_HOST');
    const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
    const database = Deno.env.get('MARIADB_DATABASE');
    const dbUser = Deno.env.get('MARIADB_USER');
    const dbPassword = Deno.env.get('MARIADB_PASSWORD');

    if (!host || !database || !dbUser || !dbPassword) {
      throw new Error('Database configuration error');
    }

    dbClient = await new Client().connect({
      hostname: host,
      port: port,
      db: database,
      username: dbUser,
      password: dbPassword,
      charset: "utf8mb4",
    });

    // First create file record
    const fileResult = await dbClient.execute(`
      INSERT INTO ai_agente.t_dachser_sea_files 
      (filename, mime, rel_path, url, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [file.name, file.type, storagePath, publicUrl, file.size]);

    const arquivoId = fileResult.lastInsertId;

    // Create item record linking to file
    const itemResult = await dbClient.execute(`
      INSERT INTO ai_agente.t_dachser_sea_items 
      (view, arquivo_id, arquivo_label, container, status, active, created_at)
      VALUES (?, ?, ?, ?, 'pendente', 1, NOW())
    `, [analysisType, arquivoId, file.name, containerFromFilename]);

    const itemId = itemResult.lastInsertId;

    console.log(`[UPLOAD] Item created in MariaDB: id=${itemId}, arquivo_id=${arquivoId}, container=${containerFromFilename}`);

    await dbClient.close();

    return new Response(
      JSON.stringify({ 
        success: true, 
        item: {
          id: String(itemId),
          base_file_name: file.name,
          base_file_url: publicUrl,
          consignee: null,
          container: containerFromFilename,
          status: 'pendente',
          analysis_type: analysisType,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        message: 'File uploaded successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[UPLOAD] Error:', error);
    if (dbClient) {
      try { await dbClient.close(); } catch (e) { /* ignore */ }
    }
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
