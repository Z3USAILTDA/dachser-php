import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Container {
  id: number;
  numero: string;
  mbl: string;
  tipo_conteiner: string | null;
  excedente_dias: number | null;
  expected_cost_usd: number | null;
  free_time_end_date: string | null;
  free_time_days: number | null;
  ft_started_at: string | null;
  cliente: string | null;
  armador: string | null;
  navio: string | null;
  voyage: string | null;
  porto_origem: string | null;
  porto_destino: string | null;
  data_atracacao: string | null;
  rate_usd_per_day: number | null;
  pre_invoice_number: string | null;
}

interface ClientProfile {
  cliente: string;
  auto_alert_enabled: number;
}

interface DemurrageRate {
  armador: string;
  container_type: string;
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

  console.log("=== Starting Auto-Invoice Generation (MariaDB) ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let client: Client | null = null;

  try {
    const mariaConfig = {
      hostname: Deno.env.get("MARIADB_HOST") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
    };

    if (!mariaConfig.hostname || !mariaConfig.username) {
      throw new Error("MariaDB credentials not configured");
    }

    console.log(`Connecting to MariaDB at ${mariaConfig.hostname}:${mariaConfig.port}`);
    client = await new Client().connect(mariaConfig);
    console.log("✓ Connected to MariaDB");

    // Get client profiles to check which clients should be invoiced
    const clientProfiles = await client.query(`
      SELECT cliente, auto_alert_enabled 
      FROM dados_dachser.t_dachser_demurrage_client_profiles
    `) as ClientProfile[];

    const invoicableClients = new Set(
      (clientProfiles || [])
        .filter((p) => p.auto_alert_enabled === 1)
        .map((p) => p.cliente)
    );

    console.log(`Found ${invoicableClients.size} invoicable clients`);

    // Get containers with exceeded free time that don't have pre-invoices yet
    const containers = await client.query(`
      SELECT 
        id, numero, mbl, tipo_conteiner, excedente_dias, expected_cost_usd,
        free_time_end_date, free_time_days, ft_started_at, cliente, armador,
        navio, voyage, porto_origem, porto_destino, data_atracacao,
        rate_usd_per_day, pre_invoice_number
      FROM dados_dachser.t_dachser_demurrage_containers
      WHERE active = 1 
        AND risk_status IN ('exceeded', 'critical')
        AND excedente_dias > 0
        AND (pre_invoice_number IS NULL OR pre_invoice_number = '')
      ORDER BY cliente, mbl
    `) as Container[];

    console.log(`Found ${containers.length} containers with exceeded free time without pre-invoice`);

    // Get demurrage rates for calculations
    const rates = await client.query(`
      SELECT armador, container_type, free_time_days, period_type, 
             period_start_day, period_end_day, rate_usd
      FROM dados_dachser.t_dachser_demurrage_rates
      WHERE active = 1
    `) as DemurrageRate[];

    console.log(`Loaded ${rates.length} demurrage rates`);

    const results = {
      total_containers: containers.length,
      client_not_invoicable: 0,
      invoices_created: 0,
      items_created: 0,
      containers_updated: 0,
      errors: 0,
    };

    // Group containers by MBL for invoice creation
    const containersByMbl: Record<string, Container[]> = {};

    for (const container of containers) {
      // Check if client is invoicable (if profile exists and auto_alert_enabled)
      const clientName = container.cliente;
      if (clientName && clientProfiles.length > 0) {
        const hasProfile = clientProfiles.some((p) => p.cliente === clientName);
        if (hasProfile && !invoicableClients.has(clientName)) {
          results.client_not_invoicable++;
          console.log(`Skipping ${container.numero} - client ${clientName} not configured for invoicing`);
          continue;
        }
      }

      const mblKey = container.mbl || 'no_mbl';
      if (!containersByMbl[mblKey]) {
        containersByMbl[mblKey] = [];
      }
      containersByMbl[mblKey].push(container);
    }

    console.log(`Grouped into ${Object.keys(containersByMbl).length} MBL groups`);

    // Create pre-invoices for each MBL group
    for (const [mblKey, mblContainers] of Object.entries(containersByMbl)) {
      try {
        const firstContainer = mblContainers[0];

        // Calculate totals
        let totalUsd = 0;
        const invoiceItems: any[] = [];

        for (const container of mblContainers) {
          const cost = container.expected_cost_usd || 0;
          totalUsd += cost;

          // Get rate info for this container type and armador
          const containerType = container.tipo_conteiner || '40DV';
          const armador = container.armador || 'DEFAULT';
          
          // Find applicable rate
          let dailyRate = container.rate_usd_per_day;
          if (!dailyRate) {
            const applicableRate = rates.find(r => 
              (r.armador === armador || r.armador === 'DEFAULT') && 
              r.container_type === containerType &&
              r.period_type !== 'free_period'
            );
            dailyRate = applicableRate?.rate_usd || 150;
          }

          const freeTimeDays = container.free_time_days || 14;

          invoiceItems.push({
            container_id: container.id,
            container_number: container.numero,
            container_type: containerType,
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
        const invoiceNumber = `PRE-${Date.now().toString(36).toUpperCase()}-${mblKey.substring(0, 8).toUpperCase()}`;

        // Format dates for MariaDB
        const today = new Date().toISOString().split('T')[0];
        const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const arrivalDate = firstContainer.data_atracacao 
          ? new Date(firstContainer.data_atracacao).toISOString().split('T')[0]
          : today;

        // Create pre-invoice in MariaDB
        await client.execute(`
          INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoices (
            invoice_number, shipment_mbl, client_name, bl_number, vessel_name, voyage_number,
            origin_port, destination_port, arrival_date, issue_date, due_date,
            total_usd, total_brl, exchange_rate, status, workflow_status, financial_status,
            created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          invoiceNumber,
          mblKey === 'no_mbl' ? null : mblKey,
          firstContainer.cliente || null,
          mblKey === 'no_mbl' ? null : mblKey,
          firstContainer.navio || null,
          firstContainer.voyage || null,
          firstContainer.porto_origem || null,
          firstContainer.porto_destino || null,
          arrivalDate,
          today,
          dueDate,
          totalUsd,
          totalUsd * 6.16, // Default exchange rate
          6.16,
          'pending',
          'calculated',
          'PENDING',
          'auto-invoice-cron'
        ]);

        // Get the inserted pre-invoice ID
        const lastIdResult = await client.query('SELECT LAST_INSERT_ID() as id');
        const preInvoiceId = lastIdResult?.[0]?.id;

        if (!preInvoiceId) {
          console.error(`Could not get pre-invoice ID for ${invoiceNumber}`);
          results.errors++;
          continue;
        }

        results.invoices_created++;
        console.log(`✓ Created pre-invoice ${invoiceNumber} for ${firstContainer.cliente} with ${mblContainers.length} containers, total: $${totalUsd.toFixed(2)}`);

        // Create invoice items
        for (const item of invoiceItems) {
          await client.execute(`
            INSERT INTO dados_dachser.t_dachser_demurrage_pre_invoice_items (
              pre_invoice_id, container_id, container_number, container_type,
              free_time_days, period_start_date, period_end_date, days_count,
              daily_rate_usd, total_usd, period_type
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            preInvoiceId,
            item.container_id,
            item.container_number,
            item.container_type,
            item.free_time_days,
            item.period_start_date,
            item.period_end_date,
            item.days_count,
            item.daily_rate_usd,
            item.total_usd,
            item.period_type
          ]);
          results.items_created++;
        }

        // Update containers with pre-invoice number
        const containerIds = mblContainers.map(c => c.id);
        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_containers
          SET pre_invoice_number = ?, pre_invoice_status = 'GERADO', updated_at = NOW()
          WHERE id IN (${containerIds.join(',')})
        `, [invoiceNumber]);
        
        results.containers_updated += containerIds.length;

      } catch (groupError) {
        console.error(`Error processing MBL group ${mblKey}:`, groupError);
        results.errors++;
      }
    }

    await client.close();
    console.log("✓ MariaDB connection closed");

    console.log("=== Auto-Invoice Generation Complete ===");
    console.log(`Results: ${JSON.stringify(results, null, 2)}`);

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
    if (client) {
      try { await client.close(); } catch {}
    }
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
