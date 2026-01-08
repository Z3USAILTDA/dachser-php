import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShipmentInfo {
  cliente: string;
  armador: string;
  master: string;
}

interface Container {
  id: string;
  numero: string;
  risk_status: string;
  days_remaining: number | null;
  expected_cost_usd: number | null;
  shipments: ShipmentInfo | null;
}

interface ClientProfile {
  client_name: string;
  auto_alert_enabled: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Starting demurrage alert cron job...");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get client profiles to check who should receive alerts
    const { data: clientProfiles, error: profilesError } = await supabase
      .from("client_profiles")
      .select("client_name, auto_alert_enabled");

    if (profilesError) {
      console.error("Error fetching client profiles:", profilesError);
      throw profilesError;
    }

    const alertEnabledClients = new Set(
      (clientProfiles || [])
        .filter((p: ClientProfile) => p.auto_alert_enabled)
        .map((p: ClientProfile) => p.client_name)
    );

    // Get all containers at risk with their shipment info
    const { data: containers, error: containerError } = await supabase
      .from("containers")
      .select(`
        id,
        numero,
        risk_status,
        days_remaining,
        expected_cost_usd,
        shipments (
          cliente,
          armador,
          master
        )
      `)
      .in("risk_status", ["at_risk", "critical", "exceeded"]);

    if (containerError) {
      console.error("Error fetching containers:", containerError);
      throw containerError;
    }

    const typedContainers = (containers || []) as unknown as Container[];

    console.log(`Found ${typedContainers.length} containers at risk`);

    if (typedContainers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No containers at risk", emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter containers based on client profile settings
    const alertableContainers = typedContainers.filter(c => {
      const clientName = c.shipments?.cliente;
      if (!clientName) return true;
      return alertEnabledClients.has(clientName);
    });

    console.log(`${alertableContainers.length} containers eligible for alerts`);

    // Check if we already sent alerts today
    const today = new Date().toISOString().split('T')[0];
    const containerIds = alertableContainers.map(c => c.id);
    
    const { data: existingAlerts } = await supabase
      .from("demurrage_alerts")
      .select("container_id")
      .in("container_id", containerIds)
      .gte("created_at", today);

    const alreadyAlerted = new Set((existingAlerts || []).map(a => a.container_id));
    const newAlerts = alertableContainers.filter(c => !alreadyAlerted.has(c.id));

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

        const response = await fetch(`${supabaseUrl}/functions/v1/demurrage-send-alert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            container_id: container.id,
            container_number: container.numero,
            client_name: container.shipments?.cliente || "N/A",
            shipment_master: container.shipments?.master || "N/A",
            days_remaining: container.days_remaining || 0,
            expected_cost_usd: container.expected_cost_usd || 0,
            alert_type: alertType,
            recipient_emails: notificationEmails,
          }),
        });

        if (response.ok) {
          emailsSent++;
          console.log(`Alert sent for container ${container.numero}`);
        } else {
          const errorText = await response.text();
          errors.push(`Failed to send alert for ${container.numero}: ${errorText}`);
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
