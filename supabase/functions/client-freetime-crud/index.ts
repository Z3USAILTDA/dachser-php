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

async function connectWithRetry(maxRetries = 5): Promise<Client> {
  const host = Deno.env.get('MARIADB_HOST');
  const port = parseInt(Deno.env.get('MARIADB_PORT') || '3306');
  const database = Deno.env.get('MARIADB_DATABASE');
  const username = Deno.env.get('MARIADB_USER');
  const password = Deno.env.get('MARIADB_PASSWORD');

  if (!host || !database || !username || !password) {
    throw new Error('Missing MariaDB credentials');
  }

  // Random initial delay to avoid thundering herd
  await new Promise(r => setTimeout(r, Math.random() * 500));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await new Client().connect({
        hostname: host,
        port,
        db: database,
        username,
        password,
      });
      return client;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && (msg.includes('max_user_connections') || msg.includes('ETIMEDOUT') || msg.includes('Connection reset') || msg.includes('Too many connections'))) {
        const delay = 1000 * attempt + Math.random() * 1000;
        console.log(`[client-freetime-crud] Attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed to connect after retries');
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
        const rows = await client.query(
          `SELECT * FROM t_client_free_time WHERE ativo = TRUE ORDER BY created_at DESC`
        );
        result = { success: true, data: rows };
        break;
      }

      case 'create': {
        const record = data as FreeTimeRecord;
        const newId = crypto.randomUUID();
        
        await client.execute(
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
        if (record.notas !== undefined) { updates.push('notas = ?'); values.push(record.notas); }
        if (record.ativo !== undefined) { updates.push('ativo = ?'); values.push(record.ativo); }
        
        values.push(id);
        
        await client.execute(
          `UPDATE t_client_free_time SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
        
        result = { success: true };
        break;
      }

      case 'delete': {
        await client.execute(
          `UPDATE t_client_free_time SET ativo = FALSE WHERE id = ?`,
          [id]
        );
        result = { success: true };
        break;
      }

      case 'findForClient': {
        if (mbl) {
          const processoRows = await client.query(
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
          const contratoRows = await client.query(
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
    const isRetryable = msg.includes('max_user_connections') || msg.includes('ETIMEDOUT');

    return new Response(JSON.stringify({ 
      success: false, 
      error: msg,
      retryable: isRetryable
    }), {
      status: isRetryable ? 503 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
