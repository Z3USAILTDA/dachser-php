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

    const { itemId } = await req.json();

    if (!itemId) {
      return new Response(
        JSON.stringify({ error: 'Item ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching history for item ${itemId}`);

    // Get item details
    const { data: item, error: itemError } = await supabase
      .from('maritime_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemError || !item) {
      return new Response(
        JSON.stringify({ error: 'Item not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all analyses for this item
    const { data: analyses, error: analysesError } = await supabase
      .from('maritime_analyses')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (analysesError) throw analysesError;

    // Get user emails for analyses
    const userIds = [...new Set((analyses || []).map(a => a.user_id).filter(Boolean))];
    const userEmailMap: Record<string, string> = {};
    
    if (userIds.length > 0) {
      const { data: users } = await supabase.auth.admin.listUsers();
      users?.users.forEach(user => {
        if (userIds.includes(user.id)) {
          userEmailMap[user.id] = user.email || 'Unknown';
        }
      });
    }

    // Get files for each analysis
    const runsWithFiles = await Promise.all(
      (analyses || []).map(async (analysis) => {
        const { data: files, error: filesError } = await supabase
          .from('maritime_files')
          .select('*')
          .eq('analysis_id', analysis.id);

        if (filesError) {
          console.warn('Error fetching files:', filesError);
        }

        return {
          id: analysis.id,
          item_id: analysis.item_id,
          status: analysis.status,
          result_text: analysis.result_data?.result_text || '',
          json_result: analysis.result_data,
          created_at: analysis.created_at,
          updated_at: analysis.completed_at || analysis.created_at,
          created_by: analysis.user_id ? (userEmailMap[analysis.user_id] || 'Sistema') : 'Sistema',
          prompt: '',
          files: (files || []).map(f => ({
            id: f.id,
            file_name: f.file_name,
            file_url: f.file_url,
            file_type: f.file_type,
            source: 'manual',
            created_at: f.created_at,
          })),
        };
      })
    );

    console.log(`Retrieved ${runsWithFiles.length} analyses for item ${itemId}`);

    return new Response(
      JSON.stringify({
        success: true,
        item: {
          id: item.id,
          base_file_name: item.base_file_name,
          consignee: item.consignee,
          container: item.container,
          status: item.status,
          analysis_type: item.analysis_type,
          created_at: item.created_at,
          updated_at: item.updated_at,
        },
        runs: runsWithFiles,
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
