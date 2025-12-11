import { Client } from 'https://deno.land/x/mysql@v2.12.1/mod.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AwbRecord {
  awb: string;
  hawb: string;
  destinatário: string;
  origem: string;
  destino: string;
  'última atualização': string;
  último_status?: string;
  nome_analista: string | null;
  email_cliente: string | null;
}

// Normaliza HAWB para matching
function normalizeHawb(hawb: string): string {
  if (!hawb) return '';
  return hawb.trim().toUpperCase().replace(/[\s\-_\.\/\\]+/g, '');
}

// Cria shipment e evento inicial
async function createShipmentWithEvent(supabase: any, awb: AwbRecord, source: string) {
  const normalizedHawb = awb.hawb.trim();
  
  // Mapear aeroporto de origem (código de 3 letras)
  const aeroportoOrigem = awb.origem?.trim()?.toUpperCase() || 'XXX';
  const aeroportoDestino = awb.destino?.trim()?.toUpperCase() || 'GRU';

  const newShipment = {
    house: normalizedHawb,
    master: awb.awb || 'N/A',
    cliente: awb.destinatário || 'Cliente DEP',
    aeroporto_origem: aeroportoOrigem.length === 3 ? aeroportoOrigem : 'XXX',
    aeroporto_destino: aeroportoDestino.length === 3 ? aeroportoDestino : 'GRU',
    nome_analista_legado: awb.nome_analista || null,
    emails_cliente: awb.email_cliente || null,
    status_manifestacao: 'RECEBIDO_NOVA' as const,
  };

  const { data: created, error: createError } = await supabase
    .from('shipments')
    .insert(newShipment)
    .select('id')
    .single();

  let shipmentId = created?.id;

  if (createError) {
    // Pode ser erro de aeroporto não cadastrado - tentar sem validação
    if (createError.message.includes('aeroporto')) {
      console.log(`[${source}] Aeroporto não cadastrado para ${normalizedHawb}, usando FRA/GRU`);
      
      const fallbackShipment = {
        ...newShipment,
        aeroporto_origem: 'FRA',
        aeroporto_destino: 'GRU',
      };

      const { data: fallbackCreated, error: retryError } = await supabase
        .from('shipments')
        .insert(fallbackShipment)
        .select('id')
        .single();

      if (retryError) {
        console.error(`[${source}] Erro ao criar ${normalizedHawb}:`, retryError);
        return null;
      }
      shipmentId = fallbackCreated?.id;
    } else {
      console.error(`[${source}] Erro ao criar ${normalizedHawb}:`, createError);
      return null;
    }
  }

  // Criar evento inicial
  if (shipmentId) {
    const dataUltimaAtualizacao = awb['última atualização'];
    const eventDate = dataUltimaAtualizacao 
      ? new Date(dataUltimaAtualizacao).toISOString() 
      : new Date().toISOString();

    await supabase
      .from('cct_evento_normalizado')
      .insert({
        shipment_id: shipmentId,
        codigo_evento: 'AGUARDANDO_MANIFESTACAO',
        descricao_evento: `Processo recuperado via ${source} - Aguardando manifestação no CCT`,
        fonte: 'HANDLER',
        aeroporto: newShipment.aeroporto_destino,
        data_hora_evento: eventDate,
        nivel_confianca: 'PRIMARIA',
        detalhes_raw: { 
          source: source.toLowerCase(), 
          mawb: awb.awb,
          origem: awb.origem,
          destino: awb.destino,
          status_atual: awb.último_status || 'DEP',
        },
      });

    // Criar status inicial
    await supabase
      .from('cct_status_atual')
      .upsert({
        shipment_id: shipmentId,
        status_cct_oficial: 'AGUARDANDO_MANIFESTACAO',
        ultima_atualizacao: new Date().toISOString(),
      }, { onConflict: 'shipment_id' });

    console.log(`[${source}] Shipment criado: ${normalizedHawb} (${awb.último_status || 'DEP'})`);
  }

  return shipmentId;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let mariaClient: any = null;

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'sync';

    console.log(`[MARIADB-DEP-SYNC] Action: ${action}`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Health check
    if (action === 'health') {
      try {
        mariaClient = await new Client().connect({
          hostname: Deno.env.get('MARIADB_HOST') || '',
          port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
          username: Deno.env.get('MARIADB_USER') || '',
          password: Deno.env.get('MARIADB_PASSWORD') || '',
          db: Deno.env.get('MARIADB_DATABASE') || '',
        });

        const startTime = Date.now();
        const result = await mariaClient.query(`SELECT COUNT(*) as total FROM t_status_aereo WHERE último_status = 'DEP'`);
        const latency = Date.now() - startTime;
        
        await mariaClient.close();

        return new Response(
          JSON.stringify({ 
            status: 'online', 
            latency,
            count: result[0]?.total || 0,
            message: 'Conexão MariaDB OK' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(
          JSON.stringify({ status: 'offline', error: errorMessage }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ========================================
    // RECOVER: Buscar processos que PASSARAM por DEP mas não foram capturados
    // ========================================
    if (action === 'recover') {
      const daysBack = body.daysBack || 3; // Default: últimos 3 dias
      console.log(`[MARIADB-DEP-SYNC] Iniciando recuperação de processos perdidos (${daysBack} dias)...`);

      mariaClient = await new Client().connect({
        hostname: Deno.env.get('MARIADB_HOST') || '',
        port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
        username: Deno.env.get('MARIADB_USER') || '',
        password: Deno.env.get('MARIADB_PASSWORD') || '',
        db: Deno.env.get('MARIADB_DATABASE') || '',
      });

      console.log('[MARIADB-DEP-SYNC] Conectado ao MariaDB');

      // Buscar processos que já passaram do DEP (RCF, ARR, NFD, DLV, etc.)
      // e foram atualizados nos últimos X dias
      const postDepStatuses = ['RCF', 'ARR', 'NFD', 'AWD', 'DLV', 'OFD', 'POD', 'CCD', 'AWR'];
      const statusList = postDepStatuses.map(s => `'${s}'`).join(', ');
      
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - daysBack);
      const dateLimitStr = dateLimit.toISOString().split('T')[0];

      const query = `
        SELECT awb, hawb, destinatário, origem, destino, 
               \`última atualização\`, último_status, nome_analista, email_cliente 
        FROM t_status_aereo 
        WHERE último_status IN (${statusList})
          AND \`última atualização\` >= '${dateLimitStr}'
        ORDER BY \`última atualização\` DESC
      `;

      console.log(`[MARIADB-DEP-SYNC] Query: Buscando processos pós-DEP desde ${dateLimitStr}`);
      const postDepAwbs: AwbRecord[] = await mariaClient.query(query);
      
      console.log(`[MARIADB-DEP-SYNC] Encontrados ${postDepAwbs.length} processos pós-DEP`);

      await mariaClient.close();
      mariaClient = null;

      const recoverStats = {
        total_checked: postDepAwbs.length,
        recovered: 0,
        already_exists: 0,
        errors: 0,
        details: [] as Array<{ hawb: string; status: string; action: string }>,
      };

      // Verificar quais não existem no Supabase
      for (const awb of postDepAwbs) {
        try {
          if (!awb.hawb || awb.hawb.trim() === '') {
            continue;
          }

          const normalizedHawb = awb.hawb.trim();

          // Verificar se já existe
          const { data: existing } = await supabase
            .from('shipments')
            .select('id')
            .eq('house', normalizedHawb)
            .maybeSingle();

          if (existing) {
            recoverStats.already_exists++;
            continue;
          }

          // Não existe - criar!
          const shipmentId = await createShipmentWithEvent(supabase, awb, 'MARIADB-RECOVER');

          if (shipmentId) {
            recoverStats.recovered++;
            recoverStats.details.push({ 
              hawb: normalizedHawb, 
              status: awb.último_status || 'UNKNOWN',
              action: 'recovered' 
            });
          } else {
            recoverStats.errors++;
          }

        } catch (error) {
          console.error(`[MARIADB-DEP-SYNC] Erro recuperando ${awb.hawb}:`, error);
          recoverStats.errors++;
        }
      }

      // Log da recuperação
      await supabase.from('cct_log_entry').insert({
        conector: 'MARIADB_DEP',
        tipo: 'RECOVER',
        mensagem: `Recuperação: ${recoverStats.recovered} recuperados de ${recoverStats.total_checked} verificados (${daysBack} dias)`,
      });

      console.log('[MARIADB-DEP-SYNC] Recuperação concluída:', recoverStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Recuperação concluída: ${recoverStats.recovered} processos recuperados`,
          stats: {
            ...recoverStats,
            details: recoverStats.details.slice(0, 50),
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SYNC: Captura AWBs DEP do MariaDB
    // ========================================
    if (action === 'sync') {
      console.log('[MARIADB-DEP-SYNC] Iniciando sincronização DEP → Shipments...');

      mariaClient = await new Client().connect({
        hostname: Deno.env.get('MARIADB_HOST') || '',
        port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
        username: Deno.env.get('MARIADB_USER') || '',
        password: Deno.env.get('MARIADB_PASSWORD') || '',
        db: Deno.env.get('MARIADB_DATABASE') || '',
      });

      console.log('[MARIADB-DEP-SYNC] Conectado ao MariaDB');

      const depAwbs: AwbRecord[] = await mariaClient.query(`
        SELECT awb, hawb, destinatário, origem, destino, 
               \`última atualização\`, nome_analista, email_cliente 
        FROM t_status_aereo 
        WHERE último_status = 'DEP'
        ORDER BY \`última atualização\` DESC
      `);

      console.log(`[MARIADB-DEP-SYNC] Encontrados ${depAwbs.length} AWBs com status DEP`);

      await mariaClient.close();
      mariaClient = null;

      const syncStats = {
        total: depAwbs.length,
        created: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
        details: [] as Array<{ hawb: string; action: string }>,
      };

      for (const awb of depAwbs) {
        try {
          if (!awb.hawb || awb.hawb.trim() === '') {
            console.log(`[MARIADB-DEP-SYNC] HAWB vazio, ignorando AWB: ${awb.awb}`);
            syncStats.skipped++;
            continue;
          }

          const normalizedHawb = awb.hawb.trim();

          const { data: existing } = await supabase
            .from('shipments')
            .select('id, house, status_manifestacao')
            .eq('house', normalizedHawb)
            .maybeSingle();

          if (existing) {
            console.log(`[MARIADB-DEP-SYNC] HAWB ${normalizedHawb} já existe no CCT (${existing.id})`);
            syncStats.skipped++;
            syncStats.details.push({ hawb: normalizedHawb, action: 'skipped' });
            continue;
          }

          const shipmentId = await createShipmentWithEvent(supabase, awb, 'MARIADB-DEP-SYNC');

          if (shipmentId) {
            syncStats.created++;
            syncStats.details.push({ hawb: normalizedHawb, action: 'created' });
          } else {
            syncStats.errors++;
          }

        } catch (error) {
          console.error(`[MARIADB-DEP-SYNC] Erro processando ${awb.hawb}:`, error);
          syncStats.errors++;
        }
      }

      await supabase.from('cct_log_entry').insert({
        conector: 'MARIADB_DEP',
        tipo: 'SYNC',
        mensagem: `DEP Sync: ${syncStats.created} criados, ${syncStats.skipped} existentes, ${syncStats.errors} erros`,
      });

      console.log('[MARIADB-DEP-SYNC] Sincronização concluída:', syncStats);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Sincronização DEP concluída: ${syncStats.created} novos shipments`,
          stats: {
            ...syncStats,
            details: syncStats.details.slice(0, 30),
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Preview
    if (action === 'preview') {
      mariaClient = await new Client().connect({
        hostname: Deno.env.get('MARIADB_HOST') || '',
        port: parseInt(Deno.env.get('MARIADB_PORT') || '3306'),
        username: Deno.env.get('MARIADB_USER') || '',
        password: Deno.env.get('MARIADB_PASSWORD') || '',
        db: Deno.env.get('MARIADB_DATABASE') || '',
      });

      const depAwbs = await mariaClient.query(`
        SELECT awb, hawb, destinatário, origem, destino, nome_analista
        FROM t_status_aereo 
        WHERE último_status = 'DEP'
        ORDER BY \`última atualização\` DESC
        LIMIT 50
      `);

      await mariaClient.close();
      mariaClient = null;

      const hawbs = depAwbs.map((a: AwbRecord) => a.hawb).filter(Boolean);
      
      const { data: existingShipments } = await supabase
        .from('shipments')
        .select('house')
        .in('house', hawbs);

      const existingHawbs = new Set(existingShipments?.map(s => s.house) || []);

      const preview = depAwbs.map((awb: AwbRecord) => ({
        ...awb,
        exists_in_cct: existingHawbs.has(awb.hawb),
        action: existingHawbs.has(awb.hawb) ? 'skip' : 'create',
      }));

      return new Response(
        JSON.stringify({
          success: true,
          total: depAwbs.length,
          new_entries: preview.filter((p: any) => !p.exists_in_cct).length,
          existing: preview.filter((p: any) => p.exists_in_cct).length,
          data: preview,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action inválida. Use: health, sync, preview, recover' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    if (mariaClient) {
      try { await mariaClient.close(); } catch {}
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MARIADB-DEP-SYNC] Erro:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
