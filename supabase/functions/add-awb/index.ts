import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is currently disabled/placeholder
// Use add-awb-to-status instead for adding AWBs to tracking

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      success: false, 
      error: 'This function is disabled. Use add-awb-to-status instead.',
      message: 'The add-awb function has been deprecated. Please use the add-awb-to-status function for adding AWBs to the tracking system.'
    }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
