import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// VALIDAÇÃO DE SCHEMA (ZOD)
// ============================================

// Schema opcional para filtros de execução (ex: shipment_ids específicos)
const IngestRequestSchema = z.object({
  shipment_ids: z.array(z.string().uuid()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  force: z.boolean().optional(),
}).optional();

// Função de validação
function validateIngestRequest(data: unknown): { success: true; data: z.infer<typeof IngestRequestSchema> } | { success: false; error: string } {
  try {
    const result = IngestRequestSchema.parse(data);
    return { success: true, data: result };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return { success: false, error: `Validação falhou: ${messages}` };
    }
    return { success: false, error: 'Payload inválido' };
  }
}

interface ConnectorConfig {
  id: string;
  tipo_conector: string;
  nome_exibicao: string;
  ativo: boolean;
  url_base_api: string;
  aeroportos_atendidos: string[];
  prioridade_fonte: number;
}

// Credentials are stored as Supabase secrets, not in the database
// Access them via: Deno.env.get('CONNECTOR_RFB_API_KEY'), etc.
function getConnectorCredentials(tipoConector: string): Record<string, string> | null {
  switch (tipoConector) {
    case 'RFB':
      const rfbKey = Deno.env.get('CONNECTOR_RFB_API_KEY');
      return rfbKey ? { api_key: rfbKey } : null;
    case 'TOP_HANDLING':
      const topKey = Deno.env.get('CONNECTOR_TOP_HANDLING_API_KEY');
      return topKey ? { api_key: topKey } : null;
    case 'OUTRO_HANDLER':
      const outroKey = Deno.env.get('CONNECTOR_OUTRO_HANDLER_API_KEY');
      return outroKey ? { api_key: outroKey } : null;
    default:
      return null;
  }
}

interface Shipment {
  id: string;
  master: string;
  house: string;
  aeroporto_destino: string;
  cliente: string;
}

interface NormalizedEvent {
  shipment_id: string;
  fonte: 'RFB' | 'HANDLER' | 'MANUAL';
  codigo_evento: string;
  descricao_evento: string;
  data_hora_evento: string;
  aeroporto: string;
  recinto?: string;
  detalhes_raw?: Record<string, unknown>;
  nivel_confianca: 'PRIMARIA' | 'COMPLEMENTAR';
}

// Simulate RFB API response (replace with real API call when available)
async function fetchRFBEvents(shipment: Shipment, config: ConnectorConfig): Promise<NormalizedEvent[]> {
  console.log(`[RFB] Fetching events for house ${shipment.house} from ${config.url_base_api}`);
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // In production, this would be:
  // const response = await fetch(`${config.url_base_api}/houseDetail?houseNumber=${shipment.house}`);
  // const data = await response.json();
  
  // Simulated events for demo
  const simulatedEvents: NormalizedEvent[] = [];
  const now = new Date();
  
  // Randomly generate some events for demonstration
  if (Math.random() > 0.7) {
    simulatedEvents.push({
      shipment_id: shipment.id,
      fonte: 'RFB',
      codigo_evento: 'PC',
      descricao_evento: 'Presença de Carga Registrada no sistema RFB',
      data_hora_evento: new Date(now.getTime() - Math.random() * 3600000).toISOString(),
      aeroporto: shipment.aeroporto_destino,
      recinto: 'TECA GRU',
      detalhes_raw: { source: 'RFB_API', simulated: true },
      nivel_confianca: 'PRIMARIA'
    });
  }
  
  return simulatedEvents;
}

// Simulate Handler API response (Top Handling, etc.)
async function fetchHandlerEvents(shipment: Shipment, config: ConnectorConfig): Promise<NormalizedEvent[]> {
  console.log(`[HANDLER] Fetching events for house ${shipment.house} from ${config.url_base_api}`);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const simulatedEvents: NormalizedEvent[] = [];
  const now = new Date();
  
  if (Math.random() > 0.6) {
    simulatedEvents.push({
      shipment_id: shipment.id,
      fonte: 'HANDLER',
      codigo_evento: 'RECEPCIONADO',
      descricao_evento: 'Carga recepcionada no terminal do handler',
      data_hora_evento: new Date(now.getTime() - Math.random() * 7200000).toISOString(),
      aeroporto: shipment.aeroporto_destino,
      recinto: config.nome_exibicao,
      detalhes_raw: { source: 'HANDLER_API', handler: config.tipo_conector, simulated: true },
      nivel_confianca: 'COMPLEMENTAR'
    });
  }
  
  return simulatedEvents;
}

// Determine SLA status based on events
function calculateSLAStatus(eventos: NormalizedEvent[], ultimoEvento: Date | null): 'OK' | 'ALERTA' | 'CRITICO' {
  if (!ultimoEvento) return 'ALERTA';
  
  const now = new Date();
  const hoursSinceLastEvent = (now.getTime() - ultimoEvento.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceLastEvent > 48) return 'CRITICO';
  if (hoursSinceLastEvent > 24) return 'ALERTA';
  return 'OK';
}

// Determine next expected event
function getNextExpectedEvent(currentStatus: string): string {
  const eventFlow: Record<string, string> = {
    'CHEGADA_AERONAVE': 'Descarregamento',
    'DESCARREGAMENTO': 'Recepção no Recinto',
    'RECEPCIONADO': 'Presença de Carga',
    'PC': 'DI Registrada',
    'DI_REGISTRADA': 'Desembaraço',
    'DESEMBARACO': 'Liberação',
    'LIBERADO': 'Entrega ao Consignatário',
  };
  
  return eventFlow[currentStatus] || 'Aguardando próximo evento';
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[CCT-INGEST] Starting ingestion job...');
    
    // Parse e validar body opcional (para filtros)
    let requestOptions: z.infer<typeof IngestRequestSchema> = undefined;
    try {
      const contentType = req.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const body = await req.json();
        const validation = validateIngestRequest(body);
        if (!validation.success) {
          console.error('[CCT-INGEST] Validação falhou:', validation.error);
          return new Response(JSON.stringify({ error: validation.error }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        requestOptions = validation.data;
        console.log('[CCT-INGEST] Request options:', requestOptions);
      }
    } catch {
      // Body vazio é válido
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 1. Fetch active connectors
    const { data: connectors, error: connectorsError } = await supabase
      .from('cct_connector_config')
      .select('*')
      .eq('ativo', true)
      .order('prioridade_fonte', { ascending: true });
    
    if (connectorsError) {
      throw new Error(`Failed to fetch connectors: ${connectorsError.message}`);
    }
    
    console.log(`[CCT-INGEST] Found ${connectors?.length || 0} active connectors`);
    
    // 2. Fetch shipments that need CCT monitoring
    let shipmentsQuery = supabase
      .from('shipments')
      .select('*')
      .order('created_at', { ascending: false });
    
    // Aplicar filtros opcionais
    if (requestOptions?.shipment_ids && requestOptions.shipment_ids.length > 0) {
      shipmentsQuery = shipmentsQuery.in('id', requestOptions.shipment_ids);
    }
    
    const limit = requestOptions?.limit || 50;
    shipmentsQuery = shipmentsQuery.limit(limit);
    
    const { data: shipments, error: shipmentsError } = await shipmentsQuery;
    
    if (shipmentsError) {
      throw new Error(`Failed to fetch shipments: ${shipmentsError.message}`);
    }
    
    console.log(`[CCT-INGEST] Processing ${shipments?.length || 0} shipments`);
    
    const results = {
      processed: 0,
      eventsCreated: 0,
      statusUpdated: 0,
      exceptionsCreated: 0,
      errors: [] as string[]
    };
    
    // 3. Process each shipment
    for (const shipment of shipments || []) {
      try {
        const allEvents: NormalizedEvent[] = [];
        
        // Query each connector for this shipment
        for (const connector of connectors || []) {
          try {
            let events: NormalizedEvent[] = [];
            
            // Check if connector serves this airport
            if (!connector.aeroportos_atendidos.includes(shipment.aeroporto_destino)) {
              continue;
            }
            
            if (connector.tipo_conector === 'RFB') {
              events = await fetchRFBEvents(shipment, connector);
            } else if (connector.tipo_conector === 'TOP_HANDLING' || connector.tipo_conector === 'OUTRO_HANDLER') {
              events = await fetchHandlerEvents(shipment, connector);
            }
            
            allEvents.push(...events);
            
            // Log successful connector query
            await supabase.from('cct_log_entry').insert({
              conector: connector.nome_exibicao,
              tipo: 'SUCESSO',
              shipment_id: shipment.id,
              house: shipment.house,
              mensagem: `Consulta realizada com sucesso. ${events.length} eventos encontrados.`
            });
            
          } catch (connectorError) {
            console.error(`[CCT-INGEST] Connector error for ${connector.nome_exibicao}:`, connectorError);
            
            // Log connector error
            await supabase.from('cct_log_entry').insert({
              conector: connector.nome_exibicao,
              tipo: 'ERRO',
              shipment_id: shipment.id,
              house: shipment.house,
              mensagem: `Erro na consulta: ${connectorError instanceof Error ? connectorError.message : 'Unknown error'}`
            });
            
            // Create exception for API unavailability
            await supabase.from('cct_excecao_operacional').insert({
              shipment_id: shipment.id,
              tipo_excecao: 'API_INDISPONIVEL',
              descricao: `API ${connector.nome_exibicao} indisponível ou retornou erro`,
              fonte_detectou: 'CCT_CORE',
              status_excecao: 'ABERTA'
            });
            
            results.exceptionsCreated++;
          }
        }
        
        // 4. Insert new events (check for duplicates first)
        for (const event of allEvents) {
          // Check if event already exists
          const { data: existingEvent } = await supabase
            .from('cct_evento_normalizado')
            .select('id')
            .eq('shipment_id', event.shipment_id)
            .eq('codigo_evento', event.codigo_evento)
            .eq('fonte', event.fonte)
            .gte('data_hora_evento', new Date(new Date(event.data_hora_evento).getTime() - 60000).toISOString())
            .lte('data_hora_evento', new Date(new Date(event.data_hora_evento).getTime() + 60000).toISOString())
            .maybeSingle();
          
          if (!existingEvent) {
            const { error: insertError } = await supabase
              .from('cct_evento_normalizado')
              .insert(event);
            
            if (!insertError) {
              results.eventsCreated++;
              
              // Trigger notification via Hermes
              try {
                const notifyResponse = await fetch(
                  `${supabaseUrl}/functions/v1/cct-notify`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`
                    },
                    body: JSON.stringify({
                      shipment_id: event.shipment_id,
                      evento_codigo: event.codigo_evento,
                      evento_descricao: event.descricao_evento,
                      evento_data: event.data_hora_evento
                    })
                  }
                );
                
                if (notifyResponse.ok) {
                  console.log(`[CCT-INGEST] Notification sent for event ${event.codigo_evento}`);
                }
              } catch (notifyError) {
                console.error('[CCT-INGEST] Failed to send notification:', notifyError);
              }
            }
          }
        }
        
        // 5. Update CCT status
        const { data: latestEvents } = await supabase
          .from('cct_evento_normalizado')
          .select('*')
          .eq('shipment_id', shipment.id)
          .order('data_hora_evento', { ascending: false })
          .limit(1);
        
        const latestEvent = latestEvents?.[0];
        const ultimoEvento = latestEvent ? new Date(latestEvent.data_hora_evento) : null;
        const slaStatus = calculateSLAStatus(allEvents, ultimoEvento);
        const currentStatus = latestEvent?.codigo_evento || 'AGUARDANDO';
        
        // Upsert status
        const { data: existingStatus } = await supabase
          .from('cct_status_atual')
          .select('id')
          .eq('shipment_id', shipment.id)
          .maybeSingle();
        
        if (existingStatus) {
          await supabase
            .from('cct_status_atual')
            .update({
              status_cct_oficial: currentStatus,
              sla_status: slaStatus,
              proximo_evento_esperado: getNextExpectedEvent(currentStatus),
              ultima_atualizacao: new Date().toISOString()
            })
            .eq('shipment_id', shipment.id);
        } else {
          await supabase
            .from('cct_status_atual')
            .insert({
              shipment_id: shipment.id,
              status_cct_oficial: currentStatus,
              sla_status: slaStatus,
              proximo_evento_esperado: getNextExpectedEvent(currentStatus),
              ultima_atualizacao: new Date().toISOString()
            });
        }
        
        results.statusUpdated++;
        results.processed++;
        
      } catch (shipmentError) {
        console.error(`[CCT-INGEST] Error processing shipment ${shipment.id}:`, shipmentError);
        results.errors.push(`Shipment ${shipment.house}: ${shipmentError instanceof Error ? shipmentError.message : 'Unknown error'}`);
      }
    }
    
    console.log('[CCT-INGEST] Job completed:', results);
    
    // Log job completion
    await supabase.from('cct_log_entry').insert({
      conector: 'CCT_CORE',
      tipo: 'INFO',
      mensagem: `Job de ingestão finalizado. Processados: ${results.processed}, Eventos: ${results.eventsCreated}, Status: ${results.statusUpdated}`
    });
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'CCT ingestion completed',
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error) {
    console.error('[CCT-INGEST] Fatal error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
