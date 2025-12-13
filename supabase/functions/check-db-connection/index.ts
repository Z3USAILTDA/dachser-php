import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Database queries disabled - returning disconnected status');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        connected: false,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('MariaDB connection failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        connected: false,
        error: errorMessage,
        timestamp: new Date().toISOString()
      }),
      {
        status: 200, // Return 200 so we can handle the disconnected state in UI
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
