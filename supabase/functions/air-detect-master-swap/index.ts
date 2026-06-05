// air-detect-master-swap
// Detecta automaticamente troca de master (AWB) a partir de:
//   §2.1 dados_dachser.t_dados_aereo (id_olss + data_inclusao_nova)
//   §2.2 pantheon.extracted_emails (dachser_pdf_json.pdf_attachments.gemini_json.parsed_data)
// Registra histórico em dados_dachser.t_aereo_master_swap.
// Para EXTRACTED_EMAILS: insere linha replicada em dados_dachser.t_dados_aereo
//   com awb = novo master, master_insert = NULL, created_at = NOW().
// Aplicação: NUNCA altera awb/mawb em t_fato_aereo. Apenas marca a linha do AWB antigo
//   com last_status_code = 'DLV' (some da tela).
// Ambiguidade (mesmo id_olss + mesma data_inclusao_nova + mesmo HAWB com >1 AWB):
//   registra em t_aereo_master_discrepancia (status PENDENTE) — sem aplicar swap.

import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DB = 'dados_dachser';
const PANTHEON_DB = 'pantheon';

async function ensureSchema(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${DB}.t_aereo_master_swap (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      hawb VARCHAR(64) NOT NULL,
      awb_antigo VARCHAR(32) NOT NULL,
      awb_novo VARCHAR(32) NOT NULL,
      fonte ENUM('DADOS_AEREO','EXTRACTED_EMAILS') NOT NULL,
      id_olss VARCHAR(64) NULL,
      flight_number TEXT NULL,
      departure_airport TEXT NULL,
      destination_airport TEXT NULL,
      data_atualizacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      flag_troca_master TINYINT(1) NOT NULL DEFAULT 1,
      resolvido_manual TINYINT(1) NOT NULL DEFAULT 0,
      UNIQUE KEY uq_swap (hawb, awb_antigo, awb_novo, fonte),
      KEY idx_hawb (hawb),
      KEY idx_awb_novo (awb_novo),
      KEY idx_olss (id_olss, data_atualizacao)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${DB}.t_aereo_master_discrepancia (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      hawb VARCHAR(64) NOT NULL,
      id_olss VARCHAR(64) NULL,
      data_inclusao_nova DATETIME NULL,
      awbs_candidatos JSON NOT NULL,
      status ENUM('PENDENTE','RESOLVIDA') NOT NULL DEFAULT 'PENDENTE',
      awb_escolhido VARCHAR(32) NULL,
      resolvido_em DATETIME NULL,
      resolvido_por VARCHAR(128) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_disc (hawb, id_olss, data_inclusao_nova),
      KEY idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function applyDlvOnOldFato(client: Client, awbAntigo: string, hawb: string) {
  // Não altera awb/mawb da linha; só marca last_status_code='DLV' para a linha do AWB antigo deste HAWB
  try {
    await client.execute(
      `UPDATE ${DB}.t_fato_aereo
         SET last_status_code = 'DLV'
       WHERE TRIM(awb) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
         AND TRIM(COALESCE(hawb,'')) COLLATE utf8mb4_unicode_ci = TRIM(?) COLLATE utf8mb4_unicode_ci
         AND (last_status_code IS NULL OR last_status_code <> 'DLV')`,
      [awbAntigo, hawb]
    );
  } catch (e) {
    console.warn('[applyDlvOnOldFato] error', awbAntigo, hawb, (e as Error).message);
  }
}

async function detectFromDadosAereo(client: Client) {
  let inserted = 0, dlvApplied = 0, discrepancies = 0;

  // Grupos por id_olss com >1 awb distinto
  const groups: any[] = await client.query(`
    SELECT id_olss
    FROM ${DB}.t_dados_aereo
    WHERE id_olss IS NOT NULL AND TRIM(id_olss) <> ''
    GROUP BY id_olss
    HAVING COUNT(DISTINCT TRIM(awb_number)) > 1
  `);

  for (const g of groups) {
    const idOlss = g.id_olss;
    const rows: any[] = await client.query(`
      SELECT TRIM(awb_number) AS awb,
             TRIM(COALESCE(hawb_number,'')) AS hawb,
             DATE_FORMAT(data_inclusao_nova, '%Y-%m-%d %H:%i:%s') AS data_inclusao_nova
      FROM ${DB}.t_dados_aereo
      WHERE id_olss = ? AND awb_number IS NOT NULL AND TRIM(awb_number) <> ''
    `, [idOlss]);

    // Agrupa por HAWB
    const byHawb = new Map<string, any[]>();
    for (const r of rows) {
      const h = (r.hawb || '').toUpperCase();
      if (!byHawb.has(h)) byHawb.set(h, []);
      byHawb.get(h)!.push(r);
    }

    for (const [hawb, rs] of byHawb) {
      if (!hawb) continue;
      const awbsDistintos = Array.from(new Set(rs.map((r: any) => r.awb)));
      if (awbsDistintos.length < 2) continue;

      // Ambíguo: mesma data_inclusao_nova entre múltiplos awbs do mesmo hawb
      const dataMap = new Map<string, Set<string>>();
      for (const r of rs) {
        const k = r.data_inclusao_nova || '';
        if (!dataMap.has(k)) dataMap.set(k, new Set());
        dataMap.get(k)!.add(r.awb);
      }
      const ambiguous = Array.from(dataMap.values()).some((s) => s.size > 1);
      if (ambiguous) {
        try {
          await client.execute(
            `INSERT IGNORE INTO ${DB}.t_aereo_master_discrepancia
               (hawb, id_olss, data_inclusao_nova, awbs_candidatos, status)
             VALUES (?, ?, ?, ?, 'PENDENTE')`,
            [hawb, idOlss, rs[0].data_inclusao_nova, JSON.stringify(awbsDistintos)]
          );
          discrepancies++;
        } catch (e) {
          console.warn('[disc insert]', (e as Error).message);
        }
        continue;
      }

      // Caso normal: AWB com MAX(data_inclusao_nova) é o novo master
      rs.sort((a: any, b: any) => (b.data_inclusao_nova || '').localeCompare(a.data_inclusao_nova || ''));
      const awbNovo = rs[0].awb;
      const antigos = awbsDistintos.filter((a) => a !== awbNovo);

      for (const awbAntigo of antigos) {
        try {
          const res: any = await client.execute(
            `INSERT IGNORE INTO ${DB}.t_aereo_master_swap
               (hawb, awb_antigo, awb_novo, fonte, id_olss, data_atualizacao, flag_troca_master)
             VALUES (?, ?, ?, 'DADOS_AEREO', ?, NOW(), 1)`,
            [hawb, awbAntigo, awbNovo, idOlss]
          );
          if (res?.affectedRows) inserted++;
        } catch (e) {
          console.warn('[swap insert]', (e as Error).message);
        }
        await applyDlvOnOldFato(client, awbAntigo, hawb);
        dlvApplied++;
      }
    }
  }

  return { inserted, dlvApplied, discrepancies };
}

async function detectFromExtractedEmails(client: Client) {
  let inserted = 0, dlvApplied = 0, replicated = 0;

  // Cursor: último data_atualizacao processado para fonte EXTRACTED_EMAILS
  const cursorRow: any[] = await client.query(
    `SELECT MAX(data_atualizacao) AS last_at FROM ${DB}.t_aereo_master_swap WHERE fonte='EXTRACTED_EMAILS'`
  );
  const lastAt = cursorRow?.[0]?.last_at || '1970-01-01 00:00:00';

  let emails: any[] = [];
  try {
    emails = await client.query(`
      SELECT id, dachser_pdf_json, created_at
      FROM ${PANTHEON_DB}.extracted_emails
      WHERE dachser_pdf_json IS NOT NULL
        AND dachser_pdf_json LIKE '%"pdf_attachments"%'
        AND created_at > ?
      ORDER BY created_at ASC
      LIMIT 500
    `, [lastAt]);
  } catch (e) {
    console.warn('[extracted_emails query]', (e as Error).message);
    return { inserted, dlvApplied, replicated };
  }

  for (const em of emails) {
    let parsed: any = null;
    try {
      parsed = typeof em.dachser_pdf_json === 'string' ? JSON.parse(em.dachser_pdf_json) : em.dachser_pdf_json;
    } catch { continue; }
    const attachments = parsed?.pdf_attachments;
    if (!Array.isArray(attachments)) continue;

    for (const att of attachments) {
      const pd = att?.gemini_json?.parsed_data || att?.parsed_data;
      if (!pd) continue;
      const mawb = (pd.mawb_number || '').toString().trim();
      if (!mawb) continue;
      const hawbDetails: any[] = Array.isArray(pd.hawb_details) ? pd.hawb_details : [];
      const flights: any[] = Array.isArray(pd.flight_details) ? pd.flight_details : [];
      const flightNumber = flights.map((f: any) => f.flight_number).filter(Boolean).join(', ');
      const dep = flights.map((f: any) => f.departure_airport).filter(Boolean).join(', ');
      const dst = flights.map((f: any) => f.destination_airport).filter(Boolean).join(', ');

      for (const hd of hawbDetails) {
        const hawbRaw = (hd.hawb_number_reference || hd.hawb_number || '').toString().trim().toUpperCase();
        if (!hawbRaw) continue;

        // AWB antigo atualmente em t_fato_aereo para esse hawb
        const fatoRows: any[] = await client.query(
          `SELECT TRIM(awb) AS awb FROM ${DB}.t_fato_aereo
             WHERE TRIM(COALESCE(hawb,'')) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
               AND TRIM(awb) COLLATE utf8mb4_unicode_ci <> TRIM(?) COLLATE utf8mb4_unicode_ci
               AND (last_status_code IS NULL OR last_status_code <> 'DLV')
             ORDER BY COALESCE(last_event_date, created_at) DESC
             LIMIT 1`,
          [hawbRaw, mawb]
        );
        const awbAntigo = fatoRows?.[0]?.awb;
        if (!awbAntigo) continue;

        // Insere swap (idempotente por uq_swap)
        let didInsert = false;
        try {
          const res: any = await client.execute(
            `INSERT IGNORE INTO ${DB}.t_aereo_master_swap
               (hawb, awb_antigo, awb_novo, fonte, flight_number, departure_airport, destination_airport, data_atualizacao, flag_troca_master)
             VALUES (?, ?, ?, 'EXTRACTED_EMAILS', ?, ?, ?, NOW(), 1)`,
            [hawbRaw, awbAntigo, mawb, flightNumber || null, dep || null, dst || null]
          );
          didInsert = !!res?.affectedRows;
          if (didInsert) inserted++;
        } catch (e) {
          console.warn('[swap insert email]', (e as Error).message);
        }

        if (!didInsert) continue;

        // Replicação em t_dados_aereo: duplica linha existente (hawb+awb antigo)
        try {
          const exists: any[] = await client.query(
            `SELECT 1 FROM ${DB}.t_dados_aereo
              WHERE TRIM(COALESCE(hawb_number,'')) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
                AND TRIM(awb_number) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
              LIMIT 1`,
            [hawbRaw, mawb]
          );
          if (!exists || exists.length === 0) {
            // Pega colunas da tabela
            const cols: any[] = await client.query(
              `SELECT COLUMN_NAME
                 FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 't_dados_aereo'`,
              [DB]
            );
            const colNames = cols.map((c: any) => c.COLUMN_NAME);
            const insertCols = colNames.filter((c: string) => c.toLowerCase() !== 'id');
            const selectExprs = insertCols.map((c: string) => {
              const lc = c.toLowerCase();
              if (lc === 'awb') return `? AS \`${c}\``;
              if (lc === 'master_insert') return `NULL AS \`${c}\``;
              if (lc === 'created_at') return `NOW() AS \`${c}\``;
              return `\`${c}\``;
            }).join(', ');
            const colList = insertCols.map((c: string) => `\`${c}\``).join(', ');
            await client.execute(
              `INSERT INTO ${DB}.t_dados_aereo (${colList})
                 SELECT ${selectExprs}
                 FROM ${DB}.t_dados_aereo
                WHERE TRIM(COALESCE(hawb_number,'')) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
                  AND TRIM(awb_number) COLLATE utf8mb4_unicode_ci = ? COLLATE utf8mb4_unicode_ci
                ORDER BY created_at DESC
                LIMIT 1`,
              [mawb, hawbRaw, awbAntigo]
            );
            replicated++;
          }
        } catch (e) {
          console.warn('[replicate t_dados_aereo]', (e as Error).message);
        }

        // Aplica DLV na linha antiga de t_fato_aereo
        await applyDlvOnOldFato(client, awbAntigo, hawbRaw);
        dlvApplied++;
      }
    }
  }

  return { inserted, dlvApplied, replicated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  let client: Client | null = null;
  try {
    client = await new Client().connect({
      hostname: (Deno.env.get('MARIADB_AIR_HOST') || Deno.env.get('MARIADB_OPS_HOST')) || '',
      port: parseInt((Deno.env.get('MARIADB_AIR_PORT') || Deno.env.get('MARIADB_OPS_PORT')) || '3306'),
      username: (Deno.env.get('MARIADB_AIR_USER') || Deno.env.get('MARIADB_OPS_USER')) || '',
      password: (Deno.env.get('MARIADB_AIR_PASSWORD') || Deno.env.get('MARIADB_OPS_PASSWORD')) || '',
      db: (Deno.env.get('MARIADB_AIR_DATABASE') || Deno.env.get('MARIADB_OPS_DATABASE')) || 'dados_dachser',
      charset: 'utf8mb4',
      timeout: 60000,
    });
    await client.execute("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");
    await client.execute("SET time_zone = '-03:00'");

    await ensureSchema(client);

    const dados = await detectFromDadosAereo(client);
    const emails = await detectFromExtractedEmails(client);

    const out = {
      success: true,
      duration_ms: Date.now() - started,
      dados_aereo: dados,
      extracted_emails: emails,
    };
    console.log('[air-detect-master-swap]', JSON.stringify(out));
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[air-detect-master-swap] error', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  } finally {
    try { await client?.close(); } catch {}
  }
});
