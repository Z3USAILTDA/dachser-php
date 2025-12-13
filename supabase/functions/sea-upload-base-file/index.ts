import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Convert ArrayBuffer to base64 in chunks to avoid stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  
  return btoa(binary);
}

// Extract container from filename as fallback
function extractContainerFromFilename(fileName: string): string | null {
  const match = fileName.match(/\b([A-Z]{4}\d{7})\b/);
  return match?.[1] || null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Read file buffer for both upload and AI extraction
    const fileBuffer = await file.arrayBuffer();

    // Upload file to Supabase Storage
    const fileName = `base-files/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('maritime-files')
      .upload(fileName, fileBuffer, { contentType: file.type });

    if (uploadError) {
      console.error('[UPLOAD] Upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('maritime-files')
      .getPublicUrl(fileName);

    console.log('[UPLOAD] File uploaded, extracting metadata...');

    // Extract container from filename FIRST (fast, no CPU overhead)
    const containerFromFilename = extractContainerFromFilename(file.name);
    console.log(`[UPLOAD] Container from filename: ${containerFromFilename || 'not found'}`);
    
    // Use filename extraction only - skip AI extraction to avoid CPU timeout
    const metadata: { container: string | null; consignee: string | null } = {
      container: containerFromFilename,
      consignee: null
    };
    
    console.log('[UPLOAD] Final metadata:', metadata);

    // Create maritime item with extracted metadata
    const { data: item, error: itemError } = await supabase
      .from('maritime_items')
      .insert({
        base_file_name: file.name,
        base_file_url: publicUrl,
        analysis_type: analysisType as any,
        status: 'pendente',
        container: metadata.container,
        consignee: metadata.consignee,
      })
      .select()
      .single();

    if (itemError) throw itemError;

    console.log(`[UPLOAD] Item created: ${item.id}, container: ${metadata.container}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        item: {
          id: item.id,
          base_file_name: file.name,
          base_file_url: publicUrl,
          consignee: item.consignee,
          container: item.container,
          status: item.status,
          analysis_type: analysisType,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        message: 'File uploaded successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[UPLOAD] Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
