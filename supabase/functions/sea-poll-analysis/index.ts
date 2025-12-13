import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { id: analysisId } = await req.json();

    console.log(`Polling analysis ${analysisId}`);

    const { data: analysis, error } = await supabase
      .from('maritime_analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (error) {
      console.error('Analysis not found:', error);
      return new Response(
        JSON.stringify({ error: 'Analysis not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse result_data if it's a string
    let resultData = analysis.result_data;
    if (typeof resultData === 'string') {
      try {
        resultData = JSON.parse(resultData);
      } catch (e) {
        console.error('Failed to parse result_data:', e);
      }
    }

    // Extract progress information
    const progress = {
      step: analysis.progress_step || 'queued',
      message: analysis.progress_step || 'Analysis queued',
      percent: 0,
    };

    // Calculate percentage based on status
    const statusPercentMap: Record<string, number> = {
      'queued': 10,
      'extracting': 30,
      'processing': 60,
      'comparing': 80,
      'completed': 100,
      'pendente': 100,
      'error': 0,
    };

    progress.percent = statusPercentMap[analysis.status || 'queued'] || 0;

    console.log(`Analysis ${analysisId} status: ${analysis.status}`);

    return new Response(
      JSON.stringify({
        analysis: {
          id: analysis.id,
          status: analysis.status,
          progress_step: progress.step,
          progress_message: progress.message,
          progress_percent: progress.percent,
          result_text: resultData?.result_text || null,
          result_data: resultData,
          error_message: analysis.error_message,
          completed_at: analysis.completed_at,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
