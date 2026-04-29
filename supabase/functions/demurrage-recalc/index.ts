import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RETRYABLE_ERRORS = ['max_user_connections', 'ETIMEDOUT', 'Connection reset', 'Too many connections'];

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_ERRORS.some(e => msg.includes(e));
}

async function queryWithRetry(client: Client, sql: string, params?: unknown[], maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.query(sql, params);
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = 1000 * attempt + Math.random() * 500;
        console.log(`[demurrage-recalc] Query attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

async function executeWithRetry(client: Client, sql: string, params?: unknown[], maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.execute(sql, params);
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = 1000 * attempt + Math.random() * 500;
        console.log(`[demurrage-recalc] Execute attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

interface DemurrageContainer {
  id: number;
  numero: string;
  mbl: string | null;
  cliente: string | null;
  armador: string | null;
  tipo_conteiner: string | null;
  ft_started_at: string | null;
  data_devolucao: string | null;
  free_time_days: number;
}

interface ClientFreeTime {
  id: number;
  cliente_nome: string;
  tipo_ft: string;
  mbl: string | null;
  free_time_days: number;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  armador: string | null;
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
      hostname: (Deno.env.get("MARIADB_SEA_HOST") || Deno.env.get("MARIADB_HOST")) || "",
      port: parseInt((Deno.env.get("MARIADB_SEA_PORT") || Deno.env.get("MARIADB_PORT")) || "3306"),
      username: (Deno.env.get("MARIADB_SEA_USER") || Deno.env.get("MARIADB_USER")) || "",
      password: (Deno.env.get("MARIADB_SEA_PASSWORD") || Deno.env.get("MARIADB_PASSWORD")) || "",
      db: (Deno.env.get("MARIADB_SEA_DATABASE") || Deno.env.get("MARIADB_DATABASE")) || "",
    };

    if (!mariaConfig.hostname || !mariaConfig.username) {
      throw new Error("MariaDB credentials not configured");
    }

    // connectWithRetry
    const MAX_RETRIES = 5;
    await new Promise(r => setTimeout(r, Math.random() * 500));
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        client = await new Client().connect(mariaConfig);
        console.log("✓ Connected to MariaDB");
        break;
      } catch (connErr) {
        if (attempt < MAX_RETRIES && isRetryableError(connErr)) {
          const delay = 1000 * attempt + Math.random() * 1000;
          console.warn(`Connection attempt ${attempt} failed. Retrying in ${Math.round(delay)}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw connErr;
        }
      }
    }

    if (!client) throw new Error("Failed to connect after retries");

    const settingsRows = await queryWithRetry(client, `
      SELECT setting_key, setting_value 
      FROM dados_dachser.t_dachser_demurrage_settings
    `) as DemurrageSetting[];
    
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s) => { settings[s.setting_key] = s.setting_value; });
    
    const defaultFreeTime = parseInt(settings.default_free_time) || 14;
    const defaultRate = parseFloat(settings.default_rate) || 150;
    console.log(`Settings: FT=${defaultFreeTime} days, Rate=$${defaultRate}/day`);

    const rates = await queryWithRetry(client, `
      SELECT armador, container_type, free_time_days, rate_usd, 
             period_type, period_start_day, period_end_day
      FROM dados_dachser.t_dachser_demurrage_rates
      WHERE active = 1
    `) as DemurrageRate[];
    
    console.log(`Loaded ${rates.length} demurrage rates`);

    const ratesMap: Record<string, DemurrageRate[]> = {};
    for (const rate of rates) {
      const key = `${rate.armador}:${rate.container_type}`;
      if (!ratesMap[key]) ratesMap[key] = [];
      ratesMap[key].push(rate);
    }

    const clientFreeTimeRows = await queryWithRetry(client, `
      SELECT id, cliente_nome, tipo_ft, mbl, free_time_days, 
             vigencia_inicio, vigencia_fim, armador
      FROM dados_dachser.t_client_free_time 
      WHERE ativo = TRUE
        AND (
          tipo_ft = 'PROCESSO' 
          OR (tipo_ft = 'CONTRATO' 
              AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE())
              AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE()))
        )
    `) as ClientFreeTime[];
    
    console.log(`Loaded ${clientFreeTimeRows.length} client free time configurations`);

    const ftByMbl = new Map<string, ClientFreeTime>();
    const ftByCliente = new Map<string, ClientFreeTime>();

    for (const ft of clientFreeTimeRows) {
      if (ft.tipo_ft === 'PROCESSO' && ft.mbl) {
        ftByMbl.set(ft.mbl.toUpperCase(), ft);
      } else if (ft.tipo_ft === 'CONTRATO' && ft.cliente_nome) {
        ftByCliente.set(ft.cliente_nome.toUpperCase(), ft);
      }
    }

    const containers = await queryWithRetry(client, `
      SELECT id, numero, mbl, cliente, armador, tipo_conteiner, ft_started_at, data_devolucao, free_time_days
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
        const endDate = container.data_devolucao ? new Date(container.data_devolucao) : now;

        const containerType = container.tipo_conteiner || '40DV';
        const armador = container.armador || 'DEFAULT';
        const key = `${armador}:${containerType}`;
        const applicableRates = ratesMap[key] || ratesMap[`DEFAULT:${containerType}`] || [];
        
        let freeTimeDays = defaultFreeTime;
        let ftSource = 'DEFAULT';

        if (container.mbl && ftByMbl.has(container.mbl.toUpperCase())) {
          const ft = ftByMbl.get(container.mbl.toUpperCase())!;
          freeTimeDays = ft.free_time_days;
          ftSource = 'PROCESSO';
        } else if (container.cliente && ftByCliente.has(container.cliente.toUpperCase())) {
          const ft = ftByCliente.get(container.cliente.toUpperCase())!;
          freeTimeDays = ft.free_time_days;
          ftSource = 'CONTRATO';
        } else if (applicableRates.length > 0 && applicableRates[0].free_time_days) {
          freeTimeDays = applicableRates[0].free_time_days;
          ftSource = 'TARIFA';
        } else if (container.free_time_days) {
          freeTimeDays = container.free_time_days;
          ftSource = 'CONTAINER';
        }
        
        const freeTimeEnd = new Date(ftStart);
        freeTimeEnd.setDate(freeTimeEnd.getDate() + freeTimeDays);

        const totalDays = Math.floor((endDate.getTime() - ftStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysRemaining = Math.floor((freeTimeEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const daysExceeded = Math.max(0, totalDays - freeTimeDays);

        let demurrageCost = 0;
        let ratePerDay = defaultRate;
        
        if (daysExceeded > 0) {
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
            if (remainingDays > 0) {
              demurrageCost += remainingDays * sortedRates[sortedRates.length - 1].rate_usd;
            }
          } else {
            demurrageCost = daysExceeded * defaultRate;
          }
        }

        let riskStatus: string;
        let riskScore: number;
        
        if (container.data_devolucao) {
          riskStatus = daysExceeded > 0 ? 'exceeded' : 'safe';
          riskScore = daysExceeded > 0 ? 100 : 0;
        } else if (daysRemaining > 5) {
          riskStatus = 'safe'; riskScore = 20; results.safe++;
        } else if (daysRemaining > 2) {
          riskStatus = 'at_risk'; riskScore = 50; results.at_risk++;
        } else if (daysRemaining > 0) {
          riskStatus = 'critical'; riskScore = 80; results.critical++;
        } else {
          riskStatus = 'exceeded'; riskScore = 100; results.exceeded++;
        }

        const freeTimeEndStr = freeTimeEnd.toISOString().split('T')[0];

        await executeWithRetry(client, `
          UPDATE dados_dachser.t_dachser_demurrage_containers SET
            free_time_days = ?,
            free_time_end_date = ?,
            days_remaining = ?,
            excedente_dias = ?,
            expected_cost_usd = ?,
            rate_usd_per_day = ?,
            risk_status = ?,
            risk_score = ?,
            ft_source = ?,
            updated_at = NOW()
          WHERE id = ?
        `, [
          freeTimeDays, freeTimeEndStr, Math.max(0, daysRemaining),
          daysExceeded, demurrageCost, ratePerDay,
          riskStatus, riskScore, ftSource, container.id
        ]);

        results.updated++;
        results.total_demurrage_usd += demurrageCost;

      } catch (err) {
        console.error(`Error processing ${container.numero}:`, err);
        results.errors++;
      }
    }

    await client.close();
    console.log('=== Recalculation Complete ===');

    return new Response(JSON.stringify({
      success: true,
      message: 'Demurrage recalculation completed (MariaDB)',
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Recalc error:', err);
    if (client) { try { await client.close(); } catch {} }
    const errMsg = err instanceof Error ? err.message : String(err);
    const retryable = isRetryableError(err);
    return new Response(JSON.stringify({
      success: false, error: errMsg, retryable,
    }), {
      status: retryable ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
