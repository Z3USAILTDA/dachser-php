import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Parse request body to get itemId
    const { id: itemId } = await req.json();

    if (!itemId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Item ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching item:', itemId);

    // Fetch the specific item
    const { data: item, error: itemError } = await supabaseClient
      .from('maritime_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();

    if (itemError) {
      console.error('Error fetching item:', itemError);
      return new Response(
        JSON.stringify({ success: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!item) {
      console.log('Item not found:', itemId);
      return new Response(
        JSON.stringify({ success: false, error: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Count files by type - get analyses for this item first, then files
    const { data: analyses } = await supabaseClient
      .from('maritime_analyses')
      .select('id')
      .eq('item_id', itemId);

    const analysisIds = (analyses || []).map(a => a.id);
    
    let fileCounts: any = {};
    if (analysisIds.length > 0) {
      const { data: files } = await supabaseClient
        .from('maritime_files')
        .select('file_type')
        .in('analysis_id', analysisIds);

      fileCounts = (files || []).reduce((acc: any, file: any) => {
        const type = file.file_type || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
    }

    const enrichedItem = {
      ...item,
      hbl_count: fileCounts.hbl || 0,
      invoice_count: fileCounts.invoice || 0,
      other_count: fileCounts.other || fileCounts.outro || 0,
      base_count: fileCounts.base || 0,
      mbl_count: fileCounts.mbl || 0,
      total_files: Object.values(fileCounts).reduce((sum: number, count: any) => sum + count, 0),
    };

    console.log('Item retrieved successfully:', enrichedItem.id);

    return new Response(
      JSON.stringify({ success: true, item: enrichedItem }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in get-item:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
