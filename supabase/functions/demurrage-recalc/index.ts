import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Container {
  id: string;
  numero: string;
  ft_started_at: string | null;
  data_devolucao: string | null;
  tipo_conteiner: string | null;
  shipments?: {
    armador: string;
    cliente: string;
  } | null;
}

interface DemurrageRate {
  container_type: string;
  free_time_days: number;
  period_type: string;
  period_start_day: number | null;
  period_end_day: number | null;
  rate_usd: number;
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

    // Fetch system settings
    const { data: settingsData } = await supabase
      .from('system_settings')
      .select('key, value');
    
    const settings: Record<string, string> = {};
    (settingsData || []).forEach((s: { key: string; value: string }) => {
      settings[s.key] = s.value;
    });
    
    const defaultFreeTime = parseInt(settings.default_free_time) || 14;
    const defaultRate = parseFloat(settings.default_rate) || 150;
    console.log(`System settings: FT=${defaultFreeTime} days, Rate=$${defaultRate}/day`);

    // Fetch demurrage rates
    const { data: rates, error: ratesError } = await supabase
      .from('demurrage_rates')
      .select('container_type, free_time_days, period_type, period_start_day, period_end_day, rate_usd')
      .eq('active', true);

    if (ratesError) throw new Error(`Failed to fetch rates: ${ratesError.message}`);
    
    const ratesList = (rates || []) as DemurrageRate[];
    console.log(`Loaded ${ratesList.length} demurrage rates`);

    // Build rate lookup by container type
    const ratesByType: Record<string, DemurrageRate[]> = {};
    for (const rate of ratesList) {
      if (!ratesByType[rate.container_type]) {
        ratesByType[rate.container_type] = [];
      }
      ratesByType[rate.container_type].push(rate);
    }

    // Fetch containers with ft_started_at set
    const { data: containers, error: containersError } = await supabase
      .from('containers')
      .select(`
        id,
        numero,
        ft_started_at,
        data_devolucao,
        tipo_conteiner,
        shipments (
          armador,
          cliente
        )
      `)
      .not('ft_started_at', 'is', null);

    if (containersError) throw new Error(`Failed to fetch containers: ${containersError.message}`);

    const containerList = (containers as unknown as Container[]) || [];
    console.log(`Found ${containerList.length} containers to recalculate`);

    const results = {
      total: containerList.length,
      updated: 0,
      returned: 0,
      in_free_time: 0,
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

        // Get rates for this container type (default to 40DV if not found)
        const containerType = container.tipo_conteiner || '40DV';
        const applicableRates = ratesByType[containerType] || ratesByType['40DV'] || [];
        
        // Get free time days (use system default if not found)
        const freeTimeDays = applicableRates[0]?.free_time_days || defaultFreeTime;
        
        // Calculate free time end date
        const freeTimeEnd = new Date(ftStart);
        freeTimeEnd.setDate(freeTimeEnd.getDate() + freeTimeDays);

        // Calculate days from FT start to end date
        const totalDays = Math.floor((endDate.getTime() - ftStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.floor((freeTimeEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysExceeded = Math.max(0, totalDays - freeTimeDays);

        // Calculate demurrage cost based on tiered rates
        let demurrageCost = 0;
        
        if (daysExceeded > 0) {
          // Sort rates by period_start_day
          const sortedRates = applicableRates
            .filter(r => r.period_type !== 'free_period')
            .sort((a, b) => (a.period_start_day || 0) - (b.period_start_day || 0));

          let remainingDays = daysExceeded;
          
          for (const rate of sortedRates) {
            if (remainingDays <= 0) break;
            
            const periodStart = (rate.period_start_day || 1) - freeTimeDays;
            const periodEnd = rate.period_end_day ? (rate.period_end_day - freeTimeDays) : Infinity;
            
            const daysInPeriod = Math.min(
              remainingDays,
              periodEnd - Math.max(0, periodStart) + 1
            );
            
            if (daysInPeriod > 0) {
              demurrageCost += daysInPeriod * rate.rate_usd;
              remainingDays -= daysInPeriod;
            }
          }

          // If no specific rates found, use system default rate
          if (demurrageCost === 0) {
            demurrageCost = daysExceeded * defaultRate;
          }
        }

        // Determine status
        let riskStatus: string;
        let riskScore: number;
        
        if (container.data_devolucao) {
          // Container returned
          riskStatus = daysExceeded > 0 ? 'exceeded' : 'safe';
          riskScore = daysExceeded > 0 ? 100 : 0;
          results.returned++;
        } else if (daysRemaining > 5) {
          riskStatus = 'safe';
          riskScore = 20;
          results.in_free_time++;
        } else if (daysRemaining > 2) {
          riskStatus = 'at_risk';
          riskScore = 50;
          results.exceeded++;
        } else if (daysRemaining > 0) {
          riskStatus = 'critical';
          riskScore = 80;
          results.exceeded++;
        } else {
          riskStatus = 'exceeded';
          riskScore = 100;
          results.exceeded++;
        }

        // Update container
        const updateData: Record<string, unknown> = {
          days_remaining: Math.max(0, daysRemaining),
          excedente_dias: daysExceeded,
          free_time_end_date: freeTimeEnd.toISOString().split('T')[0],
          expected_cost_usd: demurrageCost,
          risk_status: riskStatus,
          risk_score: riskScore,
          updated_at: new Date().toISOString(),
        };

        // If returned, set cronos_status
        if (container.data_devolucao) {
          updateData.cronos_status = 'RETURNED';
        }

        await supabase
          .from('containers')
          .update(updateData)
          .eq('id', container.id);

        results.updated++;
        results.total_demurrage_usd += demurrageCost;

        console.log(`${container.numero}: ${daysExceeded} days exceeded, $${demurrageCost.toFixed(2)} demurrage, status: ${riskStatus}`);

      } catch (err) {
        const error = err as Error;
        console.error(`Error processing ${container.numero}:`, error.message);
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
