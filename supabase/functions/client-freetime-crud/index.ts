import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FreeTimeRecord {
  id: string;
  cliente_nome: string;
  cliente_cnpj?: string | null;
  tipo_ft: 'CONTRATO' | 'PROCESSO';
  mbl?: string | null;
  armador?: string | null;
  free_time_days: number;
  vigencia_inicio?: string | null;
  vigencia_fim?: string | null;
  tipo_conteiner?: string | null;
  notas?: string | null;
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

const RETRYABLE_ERRORS = ['max_user_connections', 'ETIMEDOUT', 'Connection reset', 'Too many connections'];

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE_ERRORS.some(e => msg.includes(e));
}

async function connectWithRetry(maxRetries = 5): Promise<Client> {
  const host = (Deno.env.get('MARIADB_SEA_HOST') || Deno.env.get('MARIADB_OPS_HOST'));
  const port = parseInt((Deno.env.get('MARIADB_SEA_PORT') || Deno.env.get('MARIADB_OPS_PORT')) || '3306');
  const database = (Deno.env.get('MARIADB_SEA_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE'));
  const username = (Deno.env.get('MARIADB_SEA_USER') || Deno.env.get('MARIADB_OPS_USER'));
  const password = (Deno.env.get('MARIADB_SEA_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD'));

  if (!host || !database || !username || !password) {
    throw new Error('Missing MariaDB credentials');
  }

  await new Promise(r => setTimeout(r, Math.random() * 500));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await new Client().connect({ hostname: host, port, db: database, username, password });
      return client;
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = 1000 * attempt + Math.random() * 1000;
        console.log(`[client-freetime-crud] Connect attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to connect after retries');
}

async function queryWithRetry(client: Client, sql: string, params?: unknown[], maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await client.query(sql, params);
    } catch (err) {
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = 1000 * attempt + Math.random() * 500;
        console.log(`[client-freetime-crud] Query attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
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
        console.log(`[client-freetime-crud] Execute attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    client = await connectWithRetry();

    const { action, data, id, clienteNome, mbl } = await req.json();

    let result: unknown;

    switch (action) {
      case 'list': {
        const rows = await queryWithRetry(client,
          `SELECT * FROM t_client_free_time WHERE ativo = TRUE ORDER BY created_at DESC`
        );
        result = { success: true, data: rows };
        break;
      }

      case 'create': {
        const record = data as FreeTimeRecord;
        const newId = crypto.randomUUID();
        
        await executeWithRetry(client,
          `INSERT INTO t_client_free_time 
           (id, cliente_nome, cliente_cnpj, tipo_ft, mbl, armador, free_time_days, 
            vigencia_inicio, vigencia_fim, tipo_conteiner, notas, ativo, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
          [
            newId,
            record.cliente_nome,
            record.cliente_cnpj || null,
            record.tipo_ft,
            record.mbl || null,
            record.armador || null,
            record.free_time_days,
            record.vigencia_inicio || null,
            record.vigencia_fim || null,
            record.tipo_conteiner || null,
            record.notas || null,
            record.created_by || null
          ]
        );
        
        result = { success: true, id: newId };
        break;
      }

      case 'update': {
        const record = data as Partial<FreeTimeRecord>;
        
        const updates: string[] = [];
        const values: unknown[] = [];
        
        if (record.cliente_nome !== undefined) { updates.push('cliente_nome = ?'); values.push(record.cliente_nome); }
        if (record.cliente_cnpj !== undefined) { updates.push('cliente_cnpj = ?'); values.push(record.cliente_cnpj); }
        if (record.tipo_ft !== undefined) { updates.push('tipo_ft = ?'); values.push(record.tipo_ft); }
        if (record.mbl !== undefined) { updates.push('mbl = ?'); values.push(record.mbl); }
        if (record.armador !== undefined) { updates.push('armador = ?'); values.push(record.armador); }
        if (record.free_time_days !== undefined) { updates.push('free_time_days = ?'); values.push(record.free_time_days); }
        if (record.vigencia_inicio !== undefined) { updates.push('vigencia_inicio = ?'); values.push(record.vigencia_inicio); }
        if (record.vigencia_fim !== undefined) { updates.push('vigencia_fim = ?'); values.push(record.vigencia_fim); }
        if (record.tipo_conteiner !== undefined) { updates.push('tipo_conteiner = ?'); values.push(record.tipo_conteiner); }
        if (record.notas !== undefined) { updates.push('notas = ?'); values.push(record.notas); }
        if (record.ativo !== undefined) { updates.push('ativo = ?'); values.push(record.ativo); }
        
        values.push(id);
        
        await executeWithRetry(client,
          `UPDATE t_client_free_time SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
        
        result = { success: true };
        break;
      }

      case 'delete': {
        await executeWithRetry(client,
          `UPDATE t_client_free_time SET ativo = FALSE WHERE id = ?`,
          [id]
        );
        result = { success: true };
        break;
      }

      case 'findForClient': {
        if (mbl) {
          const processoRows = await queryWithRetry(client,
            `SELECT * FROM t_client_free_time 
             WHERE tipo_ft = 'PROCESSO' AND mbl = ? AND ativo = TRUE 
             LIMIT 1`,
            [mbl]
          );
          
          if (processoRows && processoRows.length > 0) {
            result = { success: true, data: processoRows[0] };
            break;
          }
        }
        
        if (clienteNome) {
          const contratoRows = await queryWithRetry(client,
            `SELECT * FROM t_client_free_time 
             WHERE tipo_ft = 'CONTRATO' 
               AND cliente_nome = ? 
               AND ativo = TRUE
               AND (vigencia_inicio IS NULL OR vigencia_inicio <= CURDATE())
               AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE())
             ORDER BY created_at DESC
             LIMIT 1`,
            [clienteNome]
          );
          
          if (contratoRows && contratoRows.length > 0) {
            result = { success: true, data: contratoRows[0] };
            break;
          }
        }
        
        result = { success: true, data: null };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    await client.close();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[client-freetime-crud] Error:', error);
    
    if (client) {
      try { await client.close(); } catch (_) { /* ignore */ }
    }

    const msg = error instanceof Error ? error.message : 'Unknown error';
    const retryable = isRetryableError(error);

    return new Response(JSON.stringify({ 
      success: false, 
      error: msg,
      retryable
    }), {
      status: retryable ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
