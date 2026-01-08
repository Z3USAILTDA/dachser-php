import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Container {
  id: string;
  numero: string;
  updated_at: string | null;
  risk_status: string | null;
  shipments: {
    armador: string;
  } | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=== Starting Daily Monitor Cron ===");
  console.log(`Execution time: ${new Date().toISOString()}`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Step 1: Get all active containers (not returned)
    const { data: containers, error: containersError } = await supabase
      .from('containers')
      .select(`
        id,
        numero,
        updated_at,
        risk_status,
        shipments (armador)
      `)
      .is('data_devolucao', null)
      .not('ft_started_at', 'is', null);

    if (containersError) {
      throw new Error(`Error fetching containers: ${containersError.message}`);
    }

    const containerList = (containers || []) as unknown as Container[];
    console.log(`Found ${containerList.length} active containers to monitor`);

    const results = {
      total: containerList.length,
      updated_via_api: 0,
      not_updated_24h: 0,
      api_errors: 0,
      demurrage_recalculated: false,
    };

    // Step 2: Identify containers not updated in 24h
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const outdatedContainers = containerList.filter(c => {
      if (!c.updated_at) return true;
      const lastUpdate = new Date(c.updated_at);
      return lastUpdate < twentyFourHoursAgo;
    });

    results.not_updated_24h = outdatedContainers.length;
    console.log(`${results.not_updated_24h} containers not updated in 24h`);

    // Step 3: Update containers via JSON Cargo API (using fetch-timelines)
    console.log("Fetching container timelines...");
    const timelineResponse = await fetch(`${supabaseUrl}/functions/v1/demurrage-fetch-timelines`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ limit: 100 }),
    });

    if (timelineResponse.ok) {
      const timelineData = await timelineResponse.json();
      results.updated_via_api = timelineData.processed || 0;
      results.api_errors = timelineData.errors || 0;
      console.log(`Timeline fetch: ${results.updated_via_api} updated, ${results.api_errors} errors`);
    } else {
      console.error("Failed to fetch timelines");
    }

    // Step 4: Recalculate demurrage for all containers
    console.log("Recalculating demurrage...");
    const recalcResponse = await fetch(`${supabaseUrl}/functions/v1/demurrage-recalc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({}),
    });

    if (recalcResponse.ok) {
      results.demurrage_recalculated = true;
      console.log("Demurrage recalculated successfully");
    } else {
      console.error("Failed to recalculate demurrage");
    }

    // Step 5: Call auto-invoice to generate pre-invoices for exceeded containers
    console.log("Checking for auto-invoice generation...");
    await fetch(`${supabaseUrl}/functions/v1/demurrage-auto-invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({}),
    });

    // Step 6: Trigger demurrage alerts
    console.log("Triggering demurrage alerts...");
    await fetch(`${supabaseUrl}/functions/v1/demurrage-alert-cron`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    const duration = Date.now() - startTime;
    console.log("=== Daily Monitor Cron Complete ===");
    console.log(`Duration: ${duration}ms`);
    console.log(`Results: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily monitor completed",
        duration_ms: duration,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Daily monitor error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
