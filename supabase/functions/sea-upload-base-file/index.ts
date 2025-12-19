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

// Extract consignee from filename
function extractConsigneeFromFilename(fileName: string): string | null {
  // Common patterns: "CONSIGNEE_NAME_CONTAINER" or "Container_Consignee"
  const cleanName = fileName.replace(/\.(xlsx?|xlsm|csv|pdf)$/i, '');
  const parts = cleanName.split(/[-_\s]+/);
  
  // Filter out container patterns and common words
  const containerPattern = /^[A-Z]{4}\d{7}$/;
  const skipWords = ['manifest', 'pack', 'packing', 'list', 'sheet', 'container', 'hbl', 'mbl', 'bl'];
  
  const candidates = parts.filter(part => 
    !containerPattern.test(part) && 
    !skipWords.includes(part.toLowerCase()) &&
    part.length > 2
  );
  
  if (candidates.length > 0) {
    return candidates.join(' ').trim() || null;
  }
  
  return null;
}

// Extract consignee and container from XLSX content
async function extractMetadataFromXlsx(arrayBuffer: ArrayBuffer): Promise<{ consignee: string | null; container: string | null }> {
  try {
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');
    const workbook = XLSX.read(arrayBuffer, { type: 'array', sheetRows: 100 });
    
    let consignee: string | null = null;
    let container: string | null = null;
    
    // Container pattern
    const containerPattern = /\b([A-Z]{4}\d{7})\b/;
    
    // Common consignee/customer field names
    const consigneeKeywords = [
      'consignee', 'consignatario', 'customer', 'cliente', 'buyer', 'comprador',
      'importador', 'importer', 'destinatario', 'shipto', 'ship to', 'deliver to'
    ];
    
    // Container field names
    const containerKeywords = ['container', 'cntr', 'contêiner', 'conteiner'];
    
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const lines = csv.split('\n').slice(0, 50); // Check first 50 rows
      
      for (const line of lines) {
        const lineLower = line.toLowerCase();
        
        // Look for container
        if (!container) {
          const containerMatch = line.match(containerPattern);
          if (containerMatch) {
            container = containerMatch[1];
          }
        }
        
        // Look for consignee
        if (!consignee) {
          for (const keyword of consigneeKeywords) {
            if (lineLower.includes(keyword)) {
              const parts = line.split(/[,;:\t]+/);
              const keywordIndex = parts.findIndex(p => p.toLowerCase().includes(keyword));
              if (keywordIndex !== -1 && keywordIndex < parts.length - 1) {
                const value = parts[keywordIndex + 1]?.trim();
                if (value && value.length > 2 && !containerPattern.test(value)) {
                  consignee = value.substring(0, 100); // Limit length
                  break;
                }
              }
            }
          }
        }
        
        if (consignee && container) break;
      }
      
      if (consignee && container) break;
    }
    
    console.log(`[XLSX] Extracted - Consignee: ${consignee || 'not found'}, Container: ${container || 'not found'}`);
    return { consignee, container };
    
  } catch (error) {
    console.error('[XLSX] Extraction error:', error);
    return { consignee: null, container: null };
  }
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

    console.log('[UPLOAD] File uploaded to storage, extracting metadata...');

    // Extract container and consignee from filename first
    let containerFromFilename = extractContainerFromFilename(file.name);
    let consigneeFromFilename = extractConsigneeFromFilename(file.name);
    
    // Try to extract from XLSX content if it's a spreadsheet
    const extension = file.name.toLowerCase().split('.').pop();
    if (['xlsx', 'xls', 'xlsm'].includes(extension || '')) {
      const xlsxMetadata = await extractMetadataFromXlsx(fileBuffer);
      
      // Prefer XLSX content over filename extraction
      if (xlsxMetadata.container) {
        containerFromFilename = xlsxMetadata.container;
      }
      if (xlsxMetadata.consignee) {
        consigneeFromFilename = xlsxMetadata.consignee;
      }
    }
    
    console.log(`[UPLOAD] Metadata - Container: ${containerFromFilename || 'not found'}, Consignee: ${consigneeFromFilename || 'not found'}`);

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

    // Create item record linking to file (now with consignee)
    const itemResult = await dbClient.execute(`
      INSERT INTO ai_agente.t_dachser_sea_items 
      (view, arquivo_id, arquivo_label, container, consignee, status, active, created_at)
      VALUES (?, ?, ?, ?, ?, 'pendente', 1, NOW())
    `, [analysisType, arquivoId, file.name, containerFromFilename, consigneeFromFilename]);

    const itemId = itemResult.lastInsertId;

    console.log(`[UPLOAD] Item created in MariaDB: id=${itemId}, arquivo_id=${arquivoId}, container=${containerFromFilename}, consignee=${consigneeFromFilename}`);

    await dbClient.close();

    return new Response(
      JSON.stringify({ 
        success: true, 
        item: {
          id: String(itemId),
          base_file_name: file.name,
          base_file_url: publicUrl,
          consignee: consigneeFromFilename,
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
