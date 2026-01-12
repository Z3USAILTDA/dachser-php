import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function callMariaDBProxy(action: string, params: Record<string, any> = {}): Promise<any> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/mariadb-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action, ...params }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MariaDB proxy error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

async function callEdgeFunction(functionName: string, body: Record<string, any> = {}): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  return fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("=== Starting Daily Monitor Cron ===");
  console.log(`Execution time: ${new Date().toISOString()}`);

  try {
    // Step 1: Get all active containers from MariaDB (not returned)
    const containersResponse = await callMariaDBProxy('demurrage_get_containers', {
      limit: 1000
    });

    const containers = containersResponse.data || [];
    console.log(`Found ${containers.length} active containers to monitor`);

    const results = {
      total: containers.length,
      updated_via_api: 0,
      not_updated_24h: 0,
      api_errors: 0,
      demurrage_recalculated: false,
      pre_invoices_generated: false,
      alerts_sent: false,
    };

    // Step 2: Identify containers not updated in 24h
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const outdatedContainers = containers.filter((c: any) => {
      if (!c.updated_at) return true;
      const lastUpdate = new Date(c.updated_at);
      return lastUpdate < twentyFourHoursAgo;
    });

    results.not_updated_24h = outdatedContainers.length;
    console.log(`${results.not_updated_24h} containers not updated in 24h`);

    // Step 3: Update containers via JSON Cargo API (using fetch-timelines)
    console.log("Fetching container timelines...");
    try {
      const timelineResponse = await callEdgeFunction('demurrage-fetch-timelines', { limit: 100 });

      if (timelineResponse.ok) {
        const timelineData = await timelineResponse.json();
        results.updated_via_api = timelineData.processed || 0;
        results.api_errors = timelineData.errors || 0;
        console.log(`Timeline fetch: ${results.updated_via_api} updated, ${results.api_errors} errors`);
      } else {
        console.error("Failed to fetch timelines:", await timelineResponse.text());
      }
    } catch (e) {
      console.error("Error fetching timelines:", e);
    }

    // Step 4: Recalculate demurrage for all containers
    console.log("Recalculating demurrage...");
    try {
      const recalcResponse = await callEdgeFunction('demurrage-recalc', {});

      if (recalcResponse.ok) {
        results.demurrage_recalculated = true;
        console.log("Demurrage recalculated successfully");
      } else {
        console.error("Failed to recalculate demurrage:", await recalcResponse.text());
      }
    } catch (e) {
      console.error("Error recalculating demurrage:", e);
    }

    // Step 5: Call auto-invoice to generate pre-invoices for exceeded containers
    console.log("Checking for auto-invoice generation...");
    try {
      const invoiceResponse = await callEdgeFunction('demurrage-auto-invoice', {});

      if (invoiceResponse.ok) {
        const invoiceData = await invoiceResponse.json();
        results.pre_invoices_generated = invoiceData.invoices_created > 0;
        console.log(`Pre-invoices generated: ${invoiceData.invoices_created || 0}`);
      } else {
        console.error("Failed to generate pre-invoices:", await invoiceResponse.text());
      }
    } catch (e) {
      console.error("Error generating pre-invoices:", e);
    }

    // Step 6: Trigger demurrage alerts
    console.log("Triggering demurrage alerts...");
    try {
      const alertResponse = await callEdgeFunction('demurrage-alert-cron', {});

      if (alertResponse.ok) {
        const alertData = await alertResponse.json();
        results.alerts_sent = alertData.emailsSent > 0;
        console.log(`Alerts sent: ${alertData.emailsSent || 0}`);
      } else {
        console.error("Failed to send alerts:", await alertResponse.text());
      }
    } catch (e) {
      console.error("Error sending alerts:", e);
    }

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
