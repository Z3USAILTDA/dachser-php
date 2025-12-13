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

    // Support both GET (query params) and POST (JSON body)
    let analysisType;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      analysisType = url.searchParams.get('analysisType');
    } else if (req.method === 'POST') {
      const body = await req.json();
      analysisType = body.analysisType;
    }

    console.log('Fetching items from Supabase...', { analysisType });

    // Build query
    let query = supabase
      .from('maritime_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (analysisType) {
      query = query.eq('analysis_type', analysisType);
    }

    const { data: items, error: itemsError } = await query;

    if (itemsError) throw itemsError;

    console.log(`Found ${items?.length || 0} items`);

    // Get file counts for each item
    const enrichedItems = await Promise.all(
      (items || []).map(async (item) => {
        const { data: analyses, error: analysesError } = await supabase
          .from('maritime_analyses')
          .select('id')
          .eq('item_id', item.id);

        if (analysesError) {
          console.warn('Error fetching analyses:', analysesError);
        }

        const analysisIds = (analyses || []).map(a => a.id);

        let files: any[] = [];
        if (analysisIds.length > 0) {
          const { data: filesData, error: filesError } = await supabase
            .from('maritime_files')
            .select('file_type')
            .in('analysis_id', analysisIds);

          if (filesError) {
            console.warn('Error fetching files:', filesError);
          } else {
            files = filesData || [];
          }
        }

        const fileCounts = {
          hbl_count: files.filter(f => f.file_type === 'hbl').length,
          invoice_count: files.filter(f => f.file_type === 'invoice').length,
          other_count: files.filter(f => !['hbl', 'invoice', 'mbl', 'base'].includes(f.file_type)).length,
          base_count: files.filter(f => f.file_type === 'base').length,
          mbl_count: files.filter(f => f.file_type === 'mbl').length,
        };

        return {
          ...item,
          ...fileCounts,
          total_files: Object.values(fileCounts).reduce((a, b) => a + b, 0),
        };
      })
    );

    console.log(`Retrieved ${enrichedItems.length} items with file counts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        items: enrichedItems 
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
