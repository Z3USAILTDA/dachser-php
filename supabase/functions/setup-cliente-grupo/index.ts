// Setup: cria dados_dachser.t_fin_cliente_grupo e importa CSV de-para
// Uso:
//   POST sem body  -> apenas cria a tabela
//   POST { csv: "<texto csv>" } -> cria a tabela e importa (UPSERT)
//     CSV esperado: cabeçalho com colunas "RAZAO SOCIAL" e "Nome para Indicador" (qualquer ordem)
//     separador: vírgula ou ponto-e-vírgula (auto-detect)

import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let client: Client | null = null;
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const csv: string | undefined = body?.csv;

    client = await new Client().connect({
      hostname: Deno.env.get('MARIADB_FIN_HOST')!,
      port: parseInt(Deno.env.get('MARIADB_FIN_PORT') || '3306'),
      db: Deno.env.get('MARIADB_FIN_DATABASE')!,
      username: Deno.env.get('MARIADB_FIN_USER')!,
      password: Deno.env.get('MARIADB_FIN_PASSWORD')!,
      charset: 'utf8mb4',
      timeout: 60000,
    });
    await client.execute("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");

    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_fin_cliente_grupo (
        razao_social VARCHAR(255) NOT NULL,
        grupo        VARCHAR(255) NOT NULL,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (razao_social),
        KEY idx_grupo (grupo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    let imported = 0;
    let skipped = 0;
    if (csv && csv.trim()) {
      // Detect separator
      const firstLine = csv.split(/\r?\n/, 1)[0] || '';
      const sep = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
      const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (inQ) {
            if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (c === '"') inQ = false;
            else cur += c;
          } else {
            if (c === '"') inQ = true;
            else if (c === sep) { out.push(cur); cur = ''; }
            else cur += c;
          }
        }
        out.push(cur);
        return out.map(s => s.trim());
      };
      const lines = csv.split(/\r?\n/).filter(l => l.trim());
      const header = parseLine(lines[0]).map(h => h.toUpperCase().replace(/\s+/g, ' ').trim());
      const idxRazao = header.findIndex(h => h === 'RAZAO SOCIAL' || h === 'RAZÃO SOCIAL' || h === 'CLIENTE');
      const idxGrupo = header.findIndex(h => h.includes('INDICADOR') || h === 'GRUPO' || h.includes('NOME PARA'));
      if (idxRazao < 0 || idxGrupo < 0) {
        throw new Error(`Cabeçalho inválido. Encontrado: ${JSON.stringify(header)}. Esperado colunas 'RAZAO SOCIAL' e 'Nome para Indicador'.`);
      }

      const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
      const rows: [string, string][] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const razao = norm((cols[idxRazao] || '')).toUpperCase();
        const grupo = norm(cols[idxGrupo] || '');
        if (!razao || !grupo) { skipped++; continue; }
        rows.push([razao, grupo]);
      }

      // Bulk upsert in batches of 500
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '(?, ?)').join(',');
        const params: string[] = [];
        for (const [r, g] of slice) { params.push(r, g); }
        await client.execute(
          `INSERT INTO dados_dachser.t_fin_cliente_grupo (razao_social, grupo)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE grupo = VALUES(grupo)`,
          params
        );
        imported += slice.length;
      }
    }

    const countRes = await client.execute(`SELECT COUNT(*) AS total FROM dados_dachser.t_fin_cliente_grupo`);
    const total = (countRes.rows?.[0] as any)?.total ?? 0;

    return new Response(JSON.stringify({ success: true, table: 'dados_dachser.t_fin_cliente_grupo', imported, skipped, total }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('setup-cliente-grupo error:', e);
    return new Response(JSON.stringify({ success: false, error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    try { await client?.close(); } catch (_) {}
  }
});
