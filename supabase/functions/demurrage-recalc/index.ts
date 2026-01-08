import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DemurrageContainer {
  id: string;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('=== Recalculating Demurrage ===');

    // Fetch settings from t_demurrage_settings
    const { data: settingsData } = await supabase
      .from('t_demurrage_settings')
      .select('key, value');
    
    const settings: Record<string, string> = {};
    (settingsData || []).forEach((s: { key: string; value: string }) => {
      settings[s.key] = s.value;
    });
    
    const defaultFreeTime = parseInt(settings.default_free_time) || 14;
    const defaultRate = parseFloat(settings.default_rate) || 150;
    console.log(`Settings: FT=${defaultFreeTime} days, Rate=$${defaultRate}/day`);

    // Fetch rates from t_demurrage_rates
    const { data: rates, error: ratesError } = await supabase
      .from('t_demurrage_rates')
      .select('armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day')
      .eq('active', true);

    if (ratesError) throw new Error(`Failed to fetch rates: ${ratesError.message}`);
    
    const ratesList = (rates || []) as DemurrageRate[];
    console.log(`Loaded ${ratesList.length} demurrage rates`);

    // Build rate lookup by armador + container type
    const ratesMap: Record<string, DemurrageRate[]> = {};
    for (const rate of ratesList) {
      const key = `${rate.armador}:${rate.container_type}`;
      if (!ratesMap[key]) {
        ratesMap[key] = [];
      }
      ratesMap[key].push(rate);
    }

    // Fetch containers with ft_started_at set
    const { data: containers, error: containersError } = await supabase
      .from('t_demurrage_containers')
      .select('id, numero, armador, tipo_conteiner, ft_started_at, data_devolucao, free_time_days')
      .eq('active', true)
      .not('ft_started_at', 'is', null);

    if (containersError) throw new Error(`Failed to fetch containers: ${containersError.message}`);

    const containerList = (containers || []) as DemurrageContainer[];
    console.log(`Found ${containerList.length} containers to recalculate`);

    const results = {
      total: containerList.length,
      updated: 0,
      safe: 0,
      at_risk: 0,
      critical: 0,
      exceeded: 0,
      total_demurrage_usd: 0,
      errors: 0,
    };

    const now = new Date();

    for (const container of containerList) {
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

        // Update container in t_demurrage_containers
        const updateData = {
          free_time_days: freeTimeDays,
          free_time_end_date: freeTimeEnd.toISOString().split('T')[0],
          days_remaining: Math.max(0, daysRemaining),
          excedente_dias: daysExceeded,
          expected_cost_usd: demurrageCost,
          rate_usd_per_day: ratePerDay,
          risk_status: riskStatus,
          risk_score: riskScore,
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from('t_demurrage_containers')
          .update(updateData)
          .eq('id', container.id);

        if (updateError) {
          console.error(`Error updating ${container.numero}:`, updateError.message);
          results.errors++;
        } else {
          results.updated++;
          results.total_demurrage_usd += demurrageCost;
        }

        console.log(`${container.numero}: ${daysExceeded}d exceeded, $${demurrageCost.toFixed(2)}, ${riskStatus}`);

      } catch (err) {
        console.error(`Error processing ${container.numero}:`, err);
        results.errors++;
      }
    }

    console.log('=== Recalculation Complete ===');
    console.log(`Results: ${JSON.stringify(results)}`);

    return new Response(JSON.stringify({
      success: true,
      message: 'Demurrage recalculation completed',
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const error = err as Error;
    console.error('Recalc error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
