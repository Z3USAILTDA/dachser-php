import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Container {
  id: string;
  numero: string;
  tipo_conteiner: string | null;
  excedente_dias: number | null;
  expected_cost_usd: number | null;
  free_time_end_date: string | null;
  ft_started_at: string | null;
  shipments: {
    id: string;
    master: string;
    cliente: string;
    armador: string;
    porto_origem: string | null;
    porto_destino: string | null;
    data_atracacao: string | null;
  } | null;
}

interface ClientProfile {
  client_name: string;
  auto_alert_enabled: boolean;
}

interface DemurrageRate {
  container_type: string;
  container_subtype: string | null;
  free_time_days: number;
  period_type: string;
  period_start_day: number | null;
  period_end_day: number | null;
  rate_usd: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Starting Auto-Invoice Generation ===");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get client profiles to check which clients should be invoiced
    const { data: clientProfiles } = await supabase
      .from('client_profiles')
      .select('client_name, auto_alert_enabled');

    const invoicableClients = new Set(
      (clientProfiles || [])
        .filter((p: ClientProfile) => p.auto_alert_enabled)
        .map((p: ClientProfile) => p.client_name)
    );

    // Get containers with exceeded free time that don't have pre-invoices yet
    const { data: containers, error: containersError } = await supabase
      .from('containers')
      .select(`
        id,
        numero,
        tipo_conteiner,
        excedente_dias,
        expected_cost_usd,
        free_time_end_date,
        ft_started_at,
        shipments (
          id,
          master,
          cliente,
          armador,
          porto_origem,
          porto_destino,
          data_atracacao
        )
      `)
      .eq('risk_status', 'exceeded')
      .gt('excedente_dias', 0);

    if (containersError) {
      throw new Error(`Error fetching containers: ${containersError.message}`);
    }

    const containerList = (containers || []) as unknown as Container[];
    console.log(`Found ${containerList.length} containers with exceeded free time`);

    // Get existing pre-invoice items to avoid duplicates
    const containerIds = containerList.map(c => c.id);
    const { data: existingItems } = await supabase
      .from('pre_invoice_items')
      .select('container_id')
      .in('container_id', containerIds);

    const alreadyInvoiced = new Set((existingItems || []).map(item => item.container_id));

    // Get demurrage rates for calculations
    const { data: rates } = await supabase
      .from('demurrage_rates')
      .select('container_type, container_subtype, free_time_days, period_type, period_start_day, period_end_day, rate_usd')
      .eq('active', true);

    const ratesList = (rates || []) as DemurrageRate[];

    const results = {
      total_containers: containerList.length,
      already_invoiced: 0,
      client_not_invoicable: 0,
      invoices_created: 0,
      items_created: 0,
      errors: 0,
    };

    // Group containers by shipment for invoice creation
    const containersByShipment: Record<string, Container[]> = {};

    for (const container of containerList) {
      // Skip if already invoiced
      if (alreadyInvoiced.has(container.id)) {
        results.already_invoiced++;
        continue;
      }

      // Check if client is invoicable (if profile exists and auto_alert_enabled)
      const clientName = container.shipments?.cliente;
      if (clientName && clientProfiles && clientProfiles.length > 0) {
        // If client has a profile, check if they should be invoiced
        const hasProfile = clientProfiles.some((p: ClientProfile) => p.client_name === clientName);
        if (hasProfile && !invoicableClients.has(clientName)) {
          results.client_not_invoicable++;
          console.log(`Skipping ${container.numero} - client ${clientName} not configured for invoicing`);
          continue;
        }
      }

      const shipmentId = container.shipments?.id || 'no_shipment';
      if (!containersByShipment[shipmentId]) {
        containersByShipment[shipmentId] = [];
      }
      containersByShipment[shipmentId].push(container);
    }

    // Create pre-invoices for each shipment group
    for (const [shipmentId, shipmentContainers] of Object.entries(containersByShipment)) {
      try {
        const firstContainer = shipmentContainers[0];
        const shipment = firstContainer.shipments;

        if (!shipment) {
          console.warn(`No shipment info for containers in group ${shipmentId}`);
          continue;
        }

        // Calculate totals
        let totalUsd = 0;
        const invoiceItems: any[] = [];

        for (const container of shipmentContainers) {
          const cost = container.expected_cost_usd || 0;
          totalUsd += cost;

          // Get rate info for this container type
          const containerType = container.tipo_conteiner || '40DV';
          const applicableRates = ratesList.filter(r => r.container_type === containerType);
          const freeTimeDays = applicableRates[0]?.free_time_days || 5;
          const dailyRate = applicableRates.find(r => r.period_type !== 'free_period')?.rate_usd || 150;

          invoiceItems.push({
            container_id: container.id,
            container_number: container.numero,
            container_type: containerType,
            container_subtype: null,
            free_time_days: freeTimeDays,
            period_start_date: container.free_time_end_date,
            period_end_date: new Date().toISOString().split('T')[0],
            days_count: container.excedente_dias || 0,
            daily_rate_usd: dailyRate,
            total_usd: cost,
            period_type: 'exceeded',
          });
        }

        // Generate invoice number
        const invoiceNumber = `PRE-${Date.now().toString(36).toUpperCase()}`;

        // Create pre-invoice
        const { data: newInvoice, error: invoiceError } = await supabase
          .from('pre_invoices')
          .insert({
            shipment_id: shipmentId === 'no_shipment' ? null : shipmentId,
            invoice_number: invoiceNumber,
            client_name: shipment.cliente,
            bl_number: shipment.master,
            vessel_name: null,
            voyage_number: null,
            origin_port: shipment.porto_origem,
            destination_port: shipment.porto_destino,
            arrival_date: shipment.data_atracacao || new Date().toISOString().split('T')[0],
            issue_date: new Date().toISOString().split('T')[0],
            due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            total_usd: totalUsd,
            total_brl: totalUsd * 6.16, // Default exchange rate
            status: 'pending',
            workflow_status: 'calculated',
            financial_status: 'PENDING',
          })
          .select('id')
          .single();

        if (invoiceError) {
          console.error(`Error creating invoice:`, invoiceError);
          results.errors++;
          continue;
        }

        results.invoices_created++;
        console.log(`Created pre-invoice ${invoiceNumber} for ${shipment.cliente}`);

        // Create invoice items
        const itemsWithInvoiceId = invoiceItems.map(item => ({
          ...item,
          pre_invoice_id: newInvoice.id,
        }));

        const { error: itemsError } = await supabase
          .from('pre_invoice_items')
          .insert(itemsWithInvoiceId);

        if (itemsError) {
          console.error(`Error creating invoice items:`, itemsError);
        } else {
          results.items_created += itemsWithInvoiceId.length;
        }

      } catch (groupError) {
        console.error(`Error processing shipment group:`, groupError);
        results.errors++;
      }
    }

    console.log("=== Auto-Invoice Generation Complete ===");
    console.log(`Results: ${JSON.stringify(results)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Auto-invoice generation completed",
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Auto-invoice error:", error);
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
