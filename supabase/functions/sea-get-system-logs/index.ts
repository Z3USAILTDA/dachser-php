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

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { functionName, logType, limit } = await req.json();
    const maxLimit = Math.min(limit || 100, 500); // Cap at 500

    // Get logs from maritime_analyses table
    const { data: analyses, error: analysesError } = await supabase
      .from('maritime_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(maxLimit);

    if (analysesError) {
      throw analysesError;
    }

    // Get unique user IDs
    const userIds = [...new Set(analyses.map(a => a.user_id).filter(Boolean))];
    
    // Fetch user emails from auth.users
    const userEmailMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.auth.admin.listUsers();
      users?.users.forEach(user => {
        if (userIds.includes(user.id)) {
          userEmailMap[user.id] = user.email || 'Unknown';
        }
      });
    }

    // Format logs with user emails
    const logs = analyses.map(analysis => ({
      timestamp: analysis.created_at,
      function: analysis.analysis_type,
      level: analysis.status === 'error' ? 'error' : 
             analysis.status === 'completed' ? 'info' : 'info',
      message: `Analysis ${analysis.status}`,
      user_email: analysis.user_id ? (userEmailMap[analysis.user_id] || 'Sistema') : 'Sistema',
      details: {
        id: analysis.id,
        status: analysis.status,
        progress_step: analysis.progress_step,
        item_id: analysis.item_id,
        error: analysis.error_message,
        completed_at: analysis.completed_at,
        user_id: analysis.user_id
      }
    }));

    return new Response(
      JSON.stringify({ 
        logs,
        total: logs.length,
        function: functionName || 'all',
        logType: logType || 'analysis'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('Error fetching logs:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
