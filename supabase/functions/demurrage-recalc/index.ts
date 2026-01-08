import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DemurrageContainer {
  id: number;
  numero: string;
  armador: string | null;
  tipo_conteiner: string | null;
  ft_started_at: string | null;
  data_devolucao: string | null;
  free_time_days: number;
}

interface DemurrageRate {
  armador: string;
  container_type: string;
  free_time_days: number;
  rate_usd: number;
  period_type: string;
  period_start_day: number | null;
  period_end_day: number | null;
}

interface DemurrageSetting {
  setting_key: string;
  setting_value: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('=== Recalculating Demurrage (MariaDB) ===');

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

    // Fetch settings
    const settingsRows = await client.query(`
      SELECT setting_key, setting_value 
      FROM dados_dachser.t_dachser_demurrage_settings
    `) as DemurrageSetting[];
    
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s) => {
      settings[s.setting_key] = s.setting_value;
    });
    
    const defaultFreeTime = parseInt(settings.default_free_time) || 14;
    const defaultRate = parseFloat(settings.default_rate) || 150;
    console.log(`Settings: FT=${defaultFreeTime} days, Rate=$${defaultRate}/day`);

    // Fetch rates
    const rates = await client.query(`
      SELECT armador, container_type, free_time_days, rate_usd, 
             period_type, period_start_day, period_end_day
      FROM dados_dachser.t_dachser_demurrage_rates
      WHERE active = 1
    `) as DemurrageRate[];
    
    console.log(`Loaded ${rates.length} demurrage rates`);

    // Build rate lookup by armador + container type
    const ratesMap: Record<string, DemurrageRate[]> = {};
    for (const rate of rates) {
      const key = `${rate.armador}:${rate.container_type}`;
      if (!ratesMap[key]) {
        ratesMap[key] = [];
      }
      ratesMap[key].push(rate);
    }

    // Fetch containers with ft_started_at set
    const containers = await client.query(`
      SELECT id, numero, armador, tipo_conteiner, ft_started_at, data_devolucao, free_time_days
      FROM dados_dachser.t_dachser_demurrage_containers
      WHERE active = 1 AND ft_started_at IS NOT NULL
    `) as DemurrageContainer[];

    console.log(`Found ${containers.length} containers to recalculate`);

    const results = {
      total: containers.length,
      updated: 0,
      safe: 0,
      at_risk: 0,
      critical: 0,
      exceeded: 0,
      total_demurrage_usd: 0,
      errors: 0,
    };

    const now = new Date();

    for (const container of containers) {
      try {
        if (!container.ft_started_at) continue;

        const ftStart = new Date(container.ft_started_at);
        const endDate = container.data_devolucao 
          ? new Date(container.data_devolucao) 
          : now;

        // Get rates for this container (by armador + tipo_conteiner)
        const containerType = container.tipo_conteiner || '40DV';
        const armador = container.armador || 'DEFAULT';
        const key = `${armador}:${containerType}`;
        const applicableRates = ratesMap[key] || ratesMap[`DEFAULT:${containerType}`] || [];
        
        // Get free time days
        const freeTimeDays = applicableRates[0]?.free_time_days || container.free_time_days || defaultFreeTime;
        
        // Calculate free time end date
        const freeTimeEnd = new Date(ftStart);
        freeTimeEnd.setDate(freeTimeEnd.getDate() + freeTimeDays);

        // Calculate days
        const totalDays = Math.floor((endDate.getTime() - ftStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.floor((freeTimeEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysExceeded = Math.max(0, totalDays - freeTimeDays);

        // Calculate demurrage cost
        let demurrageCost = 0;
        let ratePerDay = defaultRate;
        
        if (daysExceeded > 0) {
          // Use tiered rates if available
          const sortedRates = applicableRates
            .filter(r => r.period_type !== 'free_period')
            .sort((a, b) => (a.period_start_day || 0) - (b.period_start_day || 0));

          if (sortedRates.length > 0) {
            let remainingDays = daysExceeded;
            
            for (const rate of sortedRates) {
              if (remainingDays <= 0) break;
              
              const periodStart = (rate.period_start_day || 1);
              const periodEnd = rate.period_end_day || Infinity;
              const periodLength = periodEnd - periodStart + 1;
              
              const daysInPeriod = Math.min(remainingDays, periodLength);
              
              if (daysInPeriod > 0) {
                demurrageCost += daysInPeriod * rate.rate_usd;
                ratePerDay = rate.rate_usd;
                remainingDays -= daysInPeriod;
              }
            }

            // Any remaining days use last rate
            if (remainingDays > 0) {
              const lastRate = sortedRates[sortedRates.length - 1];
              demurrageCost += remainingDays * lastRate.rate_usd;
            }
          } else {
            // No specific rates, use default
            demurrageCost = daysExceeded * defaultRate;
          }
        }

        // Determine risk status
        let riskStatus: string;
        let riskScore: number;
        
        if (container.data_devolucao) {
          // Container returned
          riskStatus = daysExceeded > 0 ? 'exceeded' : 'safe';
          riskScore = daysExceeded > 0 ? 100 : 0;
        } else if (daysRemaining > 5) {
          riskStatus = 'safe';
          riskScore = 20;
          results.safe++;
        } else if (daysRemaining > 2) {
          riskStatus = 'at_risk';
          riskScore = 50;
          results.at_risk++;
        } else if (daysRemaining > 0) {
          riskStatus = 'critical';
          riskScore = 80;
          results.critical++;
        } else {
          riskStatus = 'exceeded';
          riskScore = 100;
          results.exceeded++;
        }

        const freeTimeEndStr = freeTimeEnd.toISOString().split('T')[0];

        // Update container in MariaDB
        await client.execute(`
          UPDATE dados_dachser.t_dachser_demurrage_containers SET
            free_time_days = ?,
            free_time_end_date = ?,
            days_remaining = ?,
            excedente_dias = ?,
            expected_cost_usd = ?,
            rate_usd_per_day = ?,
            risk_status = ?,
            risk_score = ?,
            updated_at = NOW()
          WHERE id = ?
        `, [
          freeTimeDays,
          freeTimeEndStr,
          Math.max(0, daysRemaining),
          daysExceeded,
          demurrageCost,
          ratePerDay,
          riskStatus,
          riskScore,
          container.id
        ]);

        results.updated++;
        results.total_demurrage_usd += demurrageCost;

        console.log(`${container.numero}: ${daysExceeded}d exceeded, $${demurrageCost.toFixed(2)}, ${riskStatus}`);

      } catch (err) {
        console.error(`Error processing ${container.numero}:`, err);
        results.errors++;
      }
    }

    await client.close();
    console.log("✓ MariaDB connection closed");

    console.log('=== Recalculation Complete ===');
    console.log(`Results: ${JSON.stringify(results)}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Demurrage recalculation completed (MariaDB)',
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Recalc error:', err);
    if (client) {
      try { await client.close(); } catch {}
    }
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
