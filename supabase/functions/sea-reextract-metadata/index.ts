import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract container from filename - simple regex, no AI
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

    const body = await req.json();
    const { itemId, forceAll } = body;

    let itemIds: string[] = [];

    if (itemId) {
      itemIds = [itemId];
    } else if (forceAll) {
      // Get ONE item with missing container (process one at a time)
      const { data: items, error } = await supabase
        .from('maritime_items')
        .select('id')
        .is('container', null)
        .limit(1);
      
      if (error) throw error;
      itemIds = (items || []).map(i => i.id);
    } else {
      return new Response(
        JSON.stringify({ error: 'Either itemId or forceAll must be provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (itemIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No items need processing', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[REEXTRACT] Starting processing of ${itemIds.length} items`);

    // Process synchronously but with simple filename extraction (no AI)
    let processed = 0;
    let updated = 0;
    
    for (const id of itemIds) {
      const { data: item } = await supabase
        .from('maritime_items')
        .select('id, base_file_name, container')
        .eq('id', id)
        .single();
      
      if (item && !item.container) {
        const container = extractContainerFromFilename(item.base_file_name);
        if (container) {
          await supabase
            .from('maritime_items')
            .update({ container })
            .eq('id', id);
          updated++;
          console.log(`[REEXTRACT] Updated ${id}: ${container}`);
        }
      }
      processed++;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed,
        updated,
        message: `Processed ${processed} items, updated ${updated} containers`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[REEXTRACT] Error:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
