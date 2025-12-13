import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { analyzeWithLLM } from './llmAnalyzer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { itemId, analysisType, files, consignee, container } = body;

    console.log(`[maritimo-analyze] Starting analysis for item ${itemId}`);
    console.log(`  Analysis type: ${analysisType}`);
    console.log(`  Files: ${files?.length || 0}`);

    if (!analysisType) {
      throw new Error('analysisType is required');
    }

    if (!files || files.length === 0) {
      throw new Error('No files provided for analysis');
    }

    // Transform files to expected format
    const fileInfos = files.map((f: any) => ({
      file_name: f.fileName || f.file_name || f.name,
      file_type: f.fileType || f.file_type || f.type || 'comparison',
      file_url: f.fileUrl || f.file_url || f.url
    }));

    console.log(`[maritimo-analyze] Processing ${fileInfos.length} files`);

    // Run analysis
    const result = await analyzeWithLLM(
      analysisType,
      fileInfos,
      { consignee, container }
    );

    console.log(`[maritimo-analyze] Analysis completed with model: ${result.model}`);
    console.log(`[maritimo-analyze] Result length: ${result.result_text.length} chars`);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'completed',
        result_text: result.result_text,
        result_data: result.json_result,
        model: result.model
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[maritimo-analyze] Error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        result_text: null,
        result_data: null
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
