import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-rfb-signature',
};

// Mapeamento de eventos RFB para códigos CCT internos
const RFB_EVENT_MAP: Record<string, { codigo: string; descricao: string }> = {
  // Eventos de MAWB/HAWB
  'ccti-bloq-awbmawb': { codigo: 'BLOQUEIO_AWB', descricao: 'Bloqueio de AWB/MAWB pela RFB' },
  'ccti-desbloq-awbmawb': { codigo: 'DESBLOQUEIO_AWB', descricao: 'Desbloqueio de AWB/MAWB pela RFB' },
  
  // Eventos de Presença de Carga
  'ccti-inc-pc': { codigo: 'PRESENCA_CARGA', descricao: 'Presença de Carga registrada no CCT' },
  'ccti-alt-pc': { codigo: 'PC_ALTERADA', descricao: 'Presença de Carga alterada' },
  'ccti-exc-pc': { codigo: 'PC_EXCLUIDA', descricao: 'Presença de Carga excluída' },
  
  // Eventos de Entrega
  'ccti-inc-entrega': { codigo: 'ENTREGA_REGISTRADA', descricao: 'Entrega de carga registrada' },
  'ccti-alt-entrega': { codigo: 'ENTREGA_ALTERADA', descricao: 'Entrega de carga alterada' },
  'ccti-exc-entrega': { codigo: 'ENTREGA_EXCLUIDA', descricao: 'Registro de entrega excluído' },
  
  // Eventos de DI (Declaração de Importação)
  'ccti-reg-di': { codigo: 'DI_REGISTRADA', descricao: 'Declaração de Importação registrada' },
  'ccti-canal-di': { codigo: 'DI_CANAL', descricao: 'Canal de parametrização definido' },
  'ccti-desemb-di': { codigo: 'DESEMBARACO', descricao: 'DI desembaraçada' },
  
  // Eventos de Bloqueio/Desbloqueio geral
  'ccti-bloq-carga': { codigo: 'BLOQUEIO_CARGA', descricao: 'Carga bloqueada pela fiscalização' },
  'ccti-desbloq-carga': { codigo: 'DESBLOQUEIO_CARGA', descricao: 'Carga desbloqueada' },
  
  // Eventos de Manifestação
  'ccti-manif': { codigo: 'MANIFESTADO', descricao: 'Carga manifestada no CCT' },
};

// Mapeamento de canais de parametrização
const CANAL_MAP: Record<string, string> = {
  '1': 'VERDE',
  '2': 'AMARELO', 
  '3': 'VERMELHO',
  '4': 'CINZA',
};

interface RFBWebhookPayload {
  evento: string;
  timestamp: string;
  dados: {
    mawb?: string;
    hawb?: string;
    master?: string;
    house?: string;
    aeroporto?: string;
    recinto?: string;
    canal?: string;
    motivo?: string;
    numero_di?: string;
    data_registro?: string;
    [key: string]: unknown;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[RFB-WEBHOOK] Requisição recebida: ${req.method}`);

  try {
    const body = await req.json();
    
    // Health check action
    if (body.action === 'health') {
      console.log('[RFB-WEBHOOK] Health check');
      return new Response(
        JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), message: 'Webhook endpoint ready' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Simulate RFB event action - for testing the webhook flow
    if (body.action === 'simulate') {
      console.log('[RFB-WEBHOOK] Simulating RFB event');
      
      const { evento, mawb, hawb, aeroporto, canal, motivo } = body;
      
      if (!evento) {
        return new Response(
          JSON.stringify({ success: false, message: 'Evento obrigatório para simulação' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!mawb && !hawb) {
        return new Response(
          JSON.stringify({ success: false, message: 'MAWB ou HAWB obrigatório para simulação' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if event is mapped
      const eventMapping = RFB_EVENT_MAP[evento];
      if (!eventMapping) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Evento "${evento}" não mapeado. Eventos disponíveis: ${Object.keys(RFB_EVENT_MAP).join(', ')}` 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Find shipment - prioritize HAWB, only use MAWB if HAWB not provided
      let query = supabase.from('shipments').select('id, master, house, aeroporto_destino');
      
      // HAWB is more specific, use it first if available
      if (hawb) {
        query = query.eq('house', hawb);
      } else if (mawb) {
        query = query.eq('master', mawb);
      }

      const { data: shipments, error: shipmentError } = await query;

      if (shipmentError) {
        console.error('[RFB-WEBHOOK] Erro ao buscar shipment:', shipmentError);
        // Check if error is a temporary infrastructure issue (HTML response)
        const isInfraError = shipmentError.message?.includes('<!DOCTYPE') || shipmentError.message?.includes('500');
        const errorMessage = isInfraError 
          ? 'Erro temporário de infraestrutura. Tente novamente em alguns segundos.'
          : `Erro ao buscar shipment: ${shipmentError.message}`;
        return new Response(
          JSON.stringify({ success: false, message: errorMessage, retryable: isInfraError }),
          { status: isInfraError ? 503 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!shipments || shipments.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: `Shipment não encontrado com ${hawb ? `HAWB=${hawb}` : `MAWB=${mawb}`}. Verifique se o processo existe no sistema.` 
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const shipment = shipments[0];

      // Build event description
      let descricaoEvento = eventMapping.descricao;
      if (evento === 'ccti-canal-di' && canal) {
        const canalNome = CANAL_MAP[canal] || canal;
        descricaoEvento = `Canal ${canalNome} definido (SIMULAÇÃO)`;
      }
      if (motivo) {
        descricaoEvento += ` - Motivo: ${motivo}`;
      }
      descricaoEvento += ' [SIMULADO]';

      // Insert normalized event
      const { data: eventoData, error: eventoError } = await supabase
        .from('cct_evento_normalizado')
        .insert({
          shipment_id: shipment.id,
          codigo_evento: eventMapping.codigo,
          descricao_evento: descricaoEvento,
          data_hora_evento: new Date().toISOString(),
          aeroporto: aeroporto || shipment.aeroporto_destino,
          fonte: 'RFB',
          nivel_confianca: 'PRIMARIA',
          detalhes_raw: { simulacao: true, evento_original: evento, mawb, hawb, canal, motivo },
        })
        .select()
        .single();

      if (eventoError) {
        console.error('[RFB-WEBHOOK] Erro ao inserir evento simulado:', eventoError);
        return new Response(
          JSON.stringify({ success: false, message: `Erro ao criar evento: ${eventoError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update shipment status
      const statusUpdate: Record<string, unknown> = {
        status_cct_oficial: eventMapping.codigo,
        ultima_atualizacao: new Date().toISOString(),
      };

      const proximoEventoMap: Record<string, string> = {
        'PRESENCA_CARGA': 'Aguardando DI/Desembaraço',
        'DI_REGISTRADA': 'Aguardando parametrização',
        'DI_CANAL': 'Aguardando desembaraço',
        'DESEMBARACO': 'Liberado para entrega',
        'BLOQUEIO_CARGA': 'Aguardando desbloqueio',
        'BLOQUEIO_AWB': 'Aguardando desbloqueio',
        'DESBLOQUEIO_CARGA': 'Aguardando desembaraço',
        'DESBLOQUEIO_AWB': 'Aguardando próximo evento',
      };

      if (proximoEventoMap[eventMapping.codigo]) {
        statusUpdate.proximo_evento_esperado = proximoEventoMap[eventMapping.codigo];
      }

      await supabase
        .from('cct_status_atual')
        .update(statusUpdate)
        .eq('shipment_id', shipment.id);

      // Create exception for blocking events
      if (['BLOQUEIO_CARGA', 'BLOQUEIO_AWB'].includes(eventMapping.codigo)) {
        await supabase
          .from('cct_excecao_operacional')
          .insert({
            shipment_id: shipment.id,
            tipo_excecao: 'ATRASO_EVENTO',
            descricao: `⚠️ BLOQUEIO RFB (SIMULADO): ${descricaoEvento}`,
            fonte_detectou: 'RFB_WEBHOOK_SIMULACAO',
            status_excecao: 'ABERTA',
          });
      }

      // Log the simulation
      await supabase
        .from('cct_log_entry')
        .insert({
          conector: 'RFB_WEBHOOK',
          tipo: 'INFO',
          shipment_id: shipment.id,
          house: shipment.house,
          mensagem: `[SIMULAÇÃO] Evento ${eventMapping.codigo} processado`,
        });

      const duration = Date.now() - startTime;
      console.log(`[RFB-WEBHOOK] Simulação concluída em ${duration}ms`);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Evento simulado com sucesso',
          evento_id: eventoData.id,
          shipment_id: shipment.id,
          codigo_evento: eventMapping.codigo,
          descricao: descricaoEvento,
          processado_em: duration,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test URL action - for testing connector API connectivity
    if (body.action === 'test-url') {
      const urlToTest = body.url;
      console.log(`[RFB-WEBHOOK] Testing URL: ${urlToTest}`);
      
      if (!urlToTest) {
        return new Response(
          JSON.stringify({ success: false, message: 'URL não informada' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      try {
        // Validate URL format
        new URL(urlToTest);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const response = await fetch(urlToTest, {
          method: 'HEAD',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
          return new Response(
            JSON.stringify({ 
              success: true, 
              reachable: true,
              status: response.status,
              message: `Conexão estabelecida (HTTP ${response.status})` 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
          console.error(`[RFB-WEBHOOK] URL test failed: ${errorMessage}`);
          
          // Try GET if HEAD fails
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(urlToTest, {
              method: 'GET',
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                reachable: true,
                status: response.status,
                message: `Conexão estabelecida (HTTP ${response.status})` 
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          } catch {
            return new Response(
              JSON.stringify({ 
                success: false, 
                reachable: false,
                message: errorMessage.includes('abort') ? 'Timeout: API não respondeu em 10s' : `Falha na conexão: ${errorMessage}` 
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }

    // Validar secret do webhook
    const webhookSecret = Deno.env.get('RFB_WEBHOOK_SECRET');
    const signature = req.headers.get('x-rfb-signature') || req.headers.get('authorization');
    
    if (!webhookSecret) {
      console.error('[RFB-WEBHOOK] RFB_WEBHOOK_SECRET não configurado');
      return new Response(
        JSON.stringify({ error: 'Webhook não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validar assinatura (formato: Bearer <secret> ou direto o secret)
    const providedSecret = signature?.replace('Bearer ', '').trim();
    if (providedSecret !== webhookSecret) {
      console.warn('[RFB-WEBHOOK] Assinatura inválida');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parsear payload como evento RFB
    const payload: RFBWebhookPayload = body;
    console.log(`[RFB-WEBHOOK] Evento recebido: ${payload.evento}`, JSON.stringify(payload.dados));

    // Validar evento
    const eventMapping = RFB_EVENT_MAP[payload.evento];
    if (!eventMapping) {
      console.warn(`[RFB-WEBHOOK] Evento não mapeado: ${payload.evento}`);
      // Aceitar mas não processar - retorna 200 para RFB não reenviar
      return new Response(
        JSON.stringify({ status: 'ignored', message: 'Evento não mapeado' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Identificar o shipment pelo MAWB/HAWB
    const mawb = payload.dados.mawb || payload.dados.master;
    const hawb = payload.dados.hawb || payload.dados.house;
    
    if (!mawb && !hawb) {
      console.error('[RFB-WEBHOOK] MAWB ou HAWB não informado');
      return new Response(
        JSON.stringify({ error: 'MAWB ou HAWB obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar shipment
    let query = supabase.from('shipments').select('id, master, house, aeroporto_destino');
    
    if (hawb) {
      query = query.eq('house', hawb);
    }
    if (mawb) {
      query = query.eq('master', mawb);
    }

    const { data: shipments, error: shipmentError } = await query;

    if (shipmentError) {
      console.error('[RFB-WEBHOOK] Erro ao buscar shipment:', shipmentError);
      throw shipmentError;
    }

    if (!shipments || shipments.length === 0) {
      console.warn(`[RFB-WEBHOOK] Shipment não encontrado: MAWB=${mawb}, HAWB=${hawb}`);
      
      // Criar exceção para house não encontrado
      // Por enquanto, apenas logamos - em produção poderia criar uma fila de pendentes
      return new Response(
        JSON.stringify({ 
          status: 'not_found', 
          message: 'Shipment não localizado na base CCT',
          mawb,
          hawb 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shipment = shipments[0];
    console.log(`[RFB-WEBHOOK] Shipment encontrado: ${shipment.id}`);

    // Preparar descrição do evento
    let descricaoEvento = eventMapping.descricao;
    
    // Adicionar informações específicas por tipo de evento
    if (payload.evento === 'ccti-canal-di' && payload.dados.canal) {
      const canalNome = CANAL_MAP[payload.dados.canal] || payload.dados.canal;
      descricaoEvento = `Canal ${canalNome} definido para DI ${payload.dados.numero_di || ''}`;
    }
    
    if (payload.dados.motivo) {
      descricaoEvento += ` - Motivo: ${payload.dados.motivo}`;
    }

    // Inserir evento normalizado
    const { data: evento, error: eventoError } = await supabase
      .from('cct_evento_normalizado')
      .insert({
        shipment_id: shipment.id,
        codigo_evento: eventMapping.codigo,
        descricao_evento: descricaoEvento,
        data_hora_evento: payload.timestamp || new Date().toISOString(),
        aeroporto: payload.dados.aeroporto || shipment.aeroporto_destino,
        recinto: payload.dados.recinto,
        fonte: 'RFB',
        nivel_confianca: 'PRIMARIA',
        detalhes_raw: payload.dados,
      })
      .select()
      .single();

    if (eventoError) {
      console.error('[RFB-WEBHOOK] Erro ao inserir evento:', eventoError);
      throw eventoError;
    }

    console.log(`[RFB-WEBHOOK] Evento inserido: ${evento.id}`);

    // Atualizar status atual do shipment
    const statusUpdate: Record<string, unknown> = {
      status_cct_oficial: eventMapping.codigo,
      ultima_atualizacao: new Date().toISOString(),
    };

    // Definir próximo evento esperado baseado no evento atual
    const proximoEventoMap: Record<string, string> = {
      'PRESENCA_CARGA': 'Aguardando DI/Desembaraço',
      'DI_REGISTRADA': 'Aguardando parametrização',
      'DI_CANAL': 'Aguardando desembaraço',
      'DESEMBARACO': 'Liberado para entrega',
      'BLOQUEIO_CARGA': 'Aguardando desbloqueio',
      'BLOQUEIO_AWB': 'Aguardando desbloqueio',
      'DESBLOQUEIO_CARGA': 'Aguardando desembaraço',
      'DESBLOQUEIO_AWB': 'Aguardando próximo evento',
    };

    if (proximoEventoMap[eventMapping.codigo]) {
      statusUpdate.proximo_evento_esperado = proximoEventoMap[eventMapping.codigo];
    }

    const { error: statusError } = await supabase
      .from('cct_status_atual')
      .update(statusUpdate)
      .eq('shipment_id', shipment.id);

    if (statusError) {
      console.error('[RFB-WEBHOOK] Erro ao atualizar status:', statusError);
      // Não falhar por isso, evento já foi salvo
    }

    // Criar exceção para eventos críticos (bloqueios)
    if (['BLOQUEIO_CARGA', 'BLOQUEIO_AWB'].includes(eventMapping.codigo)) {
      await supabase
        .from('cct_excecao_operacional')
        .insert({
          shipment_id: shipment.id,
          tipo_excecao: 'ATRASO_EVENTO',
          descricao: `⚠️ BLOQUEIO RFB: ${descricaoEvento}`,
          fonte_detectou: 'RFB_WEBHOOK',
          status_excecao: 'ABERTA',
        });
      
      console.log(`[RFB-WEBHOOK] Exceção de bloqueio criada para shipment ${shipment.id}`);
    }

    // Log de sucesso
    await supabase
      .from('cct_log_entry')
      .insert({
        conector: 'RFB_WEBHOOK',
        tipo: 'INFO',
        shipment_id: shipment.id,
        house: shipment.house,
        mensagem: `Evento ${eventMapping.codigo} processado via webhook RFB`,
      });

    const duration = Date.now() - startTime;
    console.log(`[RFB-WEBHOOK] Processamento concluído em ${duration}ms`);

    return new Response(
      JSON.stringify({
        status: 'success',
        evento_id: evento.id,
        shipment_id: shipment.id,
        codigo_evento: eventMapping.codigo,
        processado_em: duration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[RFB-WEBHOOK] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
