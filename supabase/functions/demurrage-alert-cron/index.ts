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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting demurrage alert cron job...");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get client profiles from MariaDB
    const profilesResponse = await callMariaDBProxy('demurrage_get_client_profiles', {});
    const clientProfiles = profilesResponse.data || [];

    const alertEnabledClients = new Set(
      clientProfiles
        .filter((p: any) => p.auto_alert_enabled)
        .map((p: any) => p.client_name)
    );

    console.log(`${alertEnabledClients.size} clients have auto-alerts enabled`);

    // Get all containers at risk from MariaDB
    const containersResponse = await callMariaDBProxy('demurrage_list', {
      filters: { risk_status: ['at_risk', 'critical', 'exceeded'] },
      limit: 500
    });

    const containers = containersResponse.data || [];
    console.log(`Found ${containers.length} containers at risk`);

    if (containers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No containers at risk", emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter containers based on client profile settings
    const alertableContainers = containers.filter((c: any) => {
      const clientName = c.cliente;
      if (!clientName) return true;
      return alertEnabledClients.has(clientName);
    });

    console.log(`${alertableContainers.length} containers eligible for alerts`);

    // Check if we already sent alerts today from MariaDB
    const today = new Date().toISOString().split('T')[0];
    const containerIds = alertableContainers.map((c: any) => c.id);
    
    let alreadyAlerted = new Set<number>();
    try {
      const alertsResponse = await callMariaDBProxy('demurrage_get_alerts', {
        filters: { 
          container_ids: containerIds,
          sent_after: today
        }
      });
      alreadyAlerted = new Set((alertsResponse.data || []).map((a: any) => a.container_id));
    } catch (e) {
      console.log("Could not fetch existing alerts, proceeding with all containers");
    }

    const newAlerts = alertableContainers.filter((c: any) => !alreadyAlerted.has(c.id));

    if (newAlerts.length === 0) {
      console.log("All alerts already sent today");
      return new Response(
        JSON.stringify({ success: true, message: "All alerts already sent today", emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let emailsSent = 0;
    const errors: string[] = [];
    const notificationEmails = ["demurrage@dachser.com"];

    for (const container of newAlerts) {
      try {
        const alertType = container.risk_status === "exceeded" 
          ? "exceeded" 
          : container.days_remaining && container.days_remaining <= 1 
            ? "risk_critical" 
            : "risk_warning";

        // Send alert via demurrage-send-alert function
        const response = await fetch(`${SUPABASE_URL}/functions/v1/demurrage-send-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            container_id: container.id,
            container_number: container.numero,
            client_name: container.cliente || "N/A",
            shipment_master: container.shipment_master || "N/A",
            days_remaining: container.days_remaining || 0,
            expected_cost_usd: container.demurrage_usd || 0,
            alert_type: alertType,
            recipient_emails: notificationEmails,
          }),
        });

        if (response.ok) {
          // Record alert in MariaDB
          try {
            await callMariaDBProxy('demurrage_create_alert', {
              container_id: container.id,
              container_number: container.numero,
              alert_type: alertType,
              client_name: container.cliente || "N/A",
              shipment_master: container.shipment_master || "N/A",
              days_remaining: container.days_remaining || 0,
              expected_cost_usd: container.demurrage_usd || 0,
              recipient_emails: notificationEmails,
              status: 'sent'
            });
          } catch (e) {
            console.error("Failed to record alert:", e);
          }

          emailsSent++;
          console.log(`Alert sent for container ${container.numero}`);
        } else {
          const errorText = await response.text();
          errors.push(`Failed to send alert for ${container.numero}: ${errorText}`);
          
          // Record failed alert
          try {
            await callMariaDBProxy('demurrage_create_alert', {
              container_id: container.id,
              container_number: container.numero,
              alert_type: alertType,
              client_name: container.cliente || "N/A",
              shipment_master: container.shipment_master || "N/A",
              days_remaining: container.days_remaining || 0,
              expected_cost_usd: container.demurrage_usd || 0,
              recipient_emails: notificationEmails,
              status: 'failed',
              error_message: errorText
            });
          } catch (e) {
            console.error("Failed to record alert error:", e);
          }
        }
      } catch (e) {
        const error = e as Error;
        errors.push(`Error sending alert for ${container.numero}: ${error.message}`);
      }
    }

    console.log(`Cron job completed. Emails sent: ${emailsSent}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        totalAtRisk: containers.length,
        eligibleForAlert: alertableContainers.length,
        newAlerts: newAlerts.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in demurrage alert cron:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
