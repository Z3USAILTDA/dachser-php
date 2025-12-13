import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: { waitUntil: (promise: Promise<any>) => void };

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

function determineFileType(analysisType: string, isBase: boolean, fileName: string): string {
  if (isBase) return 'base';
  if (analysisType === 'manifest_hbl') return 'hbl';
  if (analysisType === 'hbl_mbl') return 'mbl';
  if (analysisType === 'invoices_hbl') {
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol')) return 'hbl';
    if (lowerName.includes('inv') || lowerName.includes('invoice') || lowerName.includes('commercial')) return 'invoice';
    return 'outro';
  }
  return 'outro';
}

serve(async (req) => {
  console.log('🚀 SEA Submit Analysis - Pure LLM Analysis');
  
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || null;
    }
    
    const formData = await req.formData();
    const itemId = formData.get('itemId') as string | null;
    const analysisType = formData.get('analysisType') as string;
    const files = formData.getAll('files') as File[];
    const linkDataRaw = formData.get('linkData') as string | null;
    const linkData = linkDataRaw ? JSON.parse(linkDataRaw) : null;
    const fileUrlsRaw = formData.get('fileUrls') as string | null;
    const fileUrls = fileUrlsRaw ? JSON.parse(fileUrlsRaw) : [];
    
    console.log(`📥 Received request - analysisType: ${analysisType}, itemId: ${itemId || 'null'}, files: ${files.length}, fileUrls: ${fileUrls.length}`);

    if (analysisType === 'manifest_hbl' && files.length === 0) {
      return new Response(JSON.stringify({ error: 'At least 1 HBL file is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (analysisType === 'hbl_mbl' && files.length !== 1) {
      return new Response(JSON.stringify({ error: 'Exactly 1 MBL file is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (analysisType === 'invoices_hbl' && files.length === 0 && fileUrls.length === 0) {
      return new Response(JSON.stringify({ error: 'At least 1 file is required for analysis' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let actualItemId = (!itemId || itemId.trim() === '') ? null : itemId;
    
    // For invoices_hbl: create new maritime_item if no itemId
    if (analysisType === 'invoices_hbl' && !actualItemId) {
      let baseFileName = '';
      let baseFileUrl = '';
      
      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol')) {
          baseFileName = file.name;
          const fileName = `base-files/invoices-${Date.now()}-${file.name}`;
          const { error: uploadError } = await supabase.storage.from('maritime-files').upload(fileName, file, { contentType: file.type });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(fileName);
            baseFileUrl = publicUrl;
          }
          break;
        }
      }
      
      if (!baseFileName && fileUrls.length > 0) {
        for (const fileUrl of fileUrls) {
          const lowerName = fileUrl.name.toLowerCase();
          if (lowerName.includes('hbl') || lowerName.includes('house') || lowerName.includes('hbol') || fileUrl.type === 'hbl' || fileUrl.type === 'draft') {
            baseFileName = fileUrl.name;
            baseFileUrl = fileUrl.url;
            break;
          }
        }
      }
      
      if (!baseFileName) {
        if (files.length > 0) {
          baseFileName = files[0].name;
          const fileName = `base-files/invoices-${Date.now()}-${files[0].name}`;
          const { error: uploadError } = await supabase.storage.from('maritime-files').upload(fileName, files[0], { contentType: files[0].type });
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(fileName);
            baseFileUrl = publicUrl;
          }
        } else if (fileUrls.length > 0) {
          baseFileName = fileUrls[0].name;
          baseFileUrl = fileUrls[0].url;
        }
      }
      
      if (baseFileName && baseFileUrl) {
        const { data: newItem, error: itemError } = await supabase.from('maritime_items').insert({
          analysis_type: 'invoices_hbl',
          base_file_name: baseFileName,
          base_file_url: baseFileUrl,
          status: 'queued'
        }).select().single();
        
        if (!itemError && newItem) {
          actualItemId = newItem.id;
          console.log(`📦 Created maritime_item for invoices_hbl: ${actualItemId}`);
        }
      }
    }
    
    const storagePrefix = actualItemId || `temp-${Date.now()}`;

    const { data: analysis, error: analysisError } = await supabase.from('maritime_analyses').insert({
      item_id: actualItemId, 
      analysis_type: analysisType as any, 
      status: 'queued', 
      submitted_files: { files: files.map(f => f.name), fileUrls, linkData },
      user_id: userId
    }).select().single();
    if (analysisError) throw analysisError;

    const uploadedFiles = [];
    
    for (const file of files) {
      const fileName = `submission-files/${storagePrefix}/${Date.now()}-${file.name}`;
      await supabase.storage.from('maritime-files').upload(fileName, file, { contentType: file.type });
      const { data: { publicUrl } } = supabase.storage.from('maritime-files').getPublicUrl(fileName);
      uploadedFiles.push({ name: file.name, url: publicUrl, size: file.size, type: file.type });
      await supabase.from('maritime_files').insert({ analysis_id: analysis.id, file_name: file.name, file_url: publicUrl, file_size: file.size, file_type: determineFileType(analysisType, false, file.name) });
    }

    for (const fileUrl of fileUrls) {
      let actualSize = fileUrl.size || 0;
      if (!actualSize || actualSize === 0) {
        try {
          const checkResponse = await fetch(fileUrl.url, { method: 'HEAD' });
          if (checkResponse.ok) {
            const contentLength = checkResponse.headers.get('content-length');
            actualSize = contentLength ? parseInt(contentLength, 10) : 0;
          }
        } catch (e) {
          console.error(`[VALIDATE] Error checking file ${fileUrl.name}:`, e);
        }
      }
      
      uploadedFiles.push({ name: fileUrl.name, url: fileUrl.url, size: actualSize, type: fileUrl.type });
      await supabase.from('maritime_files').insert({ analysis_id: analysis.id, file_name: fileUrl.name, file_url: fileUrl.url, file_size: actualSize, file_type: determineFileType(analysisType, false, fileUrl.name) });
    }

    if (analysisType === 'invoices_hbl' && linkData && linkData.hblFileName && linkData.invoiceFileNames?.length) {
      await supabase.from('invoice_hbl_links').insert({ analysis_id: analysis.id, hbl_file_name: linkData.hblFileName, invoice_file_names: linkData.invoiceFileNames });
    }

    if (actualItemId) {
      await supabase.from('maritime_items').update({ status: 'queued' }).eq('id', actualItemId);
    }

    let item = null;
    if (actualItemId) {
      const { data: itemData } = await supabase.from('maritime_items').select('base_file_url, base_file_name, consignee, container').eq('id', actualItemId).single();
      item = itemData;
    }

    const allFiles: Array<{ name: string; url: string; size: number; type: string; file_type: string }> = [];
    if ((analysisType === 'manifest_hbl' || analysisType === 'hbl_mbl') && item?.base_file_url && item?.base_file_name) {
      allFiles.push({ 
        name: item.base_file_name, 
        url: item.base_file_url, 
        size: 0, 
        type: 'base',
        file_type: 'base'
      });
    }
    
    for (const f of uploadedFiles) {
      allFiles.push({
        name: f.name,
        url: f.url,
        size: f.size,
        type: determineFileType(analysisType, false, f.name),
        file_type: determineFileType(analysisType, false, f.name)
      });
    }

    console.log(`🚀 Analysis queued - analysisType: ${analysisType}, itemId: ${actualItemId || 'null'}, files: ${allFiles.length}`);
    
    const processAnalysis = async () => {
      const startTime = Date.now();
      
      try {
        console.log(`📊 Background analysis started for ${analysis.id}`);
        
        await supabase.from('maritime_analyses').update({ 
          status: 'processing', 
          progress_step: 'Analisando documentos', 
          result_data: { status: 'processing', progress_percent: 50 } 
        }).eq('id', analysis.id);
        
        const { analyzeWithLLM } = await import('../maritimo-analyze/llmAnalyzer.ts');
        
        const result = await analyzeWithLLM(
          analysisType, 
          allFiles.map(f => ({ file_name: f.name, file_type: f.file_type, file_url: f.url })), 
          { consignee: item?.consignee, container: item?.container }
        );
        
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Analysis complete in ${elapsed}s (${result.result_text?.length || 0} chars)`);

        let finalStatus = 'completed';
        const isValidNoChanges = result.result_text && (
          result.result_text.includes('No changes required') ||
          result.result_text.includes('Hello, team')
        );
        
        if (!result.result_text || (result.result_text.length < 200 && !isValidNoChanges)) {
          finalStatus = 'error';
        }

        const analysisStatus = finalStatus === 'error' ? 'error' : 'pendente';
        await supabase.from('maritime_analyses').update({ 
          status: analysisStatus, 
          completed_at: new Date().toISOString(),
          result_data: { 
            result_text: result.result_text, 
            json_result: result.json_result, 
            model: result.model 
          } 
        }).eq('id', analysis.id);
        
        if (actualItemId) {
          await supabase.from('maritime_items').update({ 
            status: finalStatus === 'error' ? 'error' : 'pendente' 
          }).eq('id', actualItemId);
        }
        
      } catch (error: any) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.error(`❌ Analysis error after ${elapsed}s:`, error.message);
        
        await supabase.from('maritime_analyses').update({ 
          status: 'error',
          error_message: error.message || 'Erro desconhecido',
          completed_at: new Date().toISOString(),
          result_data: { error: error.message, elapsed_seconds: elapsed }
        }).eq('id', analysis.id);
        
        if (actualItemId) {
          await supabase.from('maritime_items').update({ status: 'error' }).eq('id', actualItemId);
        }
      }
    };
    
    EdgeRuntime.waitUntil(processAnalysis());
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        analysisId: analysis.id,
        status: 'queued',
        message: 'Análise iniciada em background'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
