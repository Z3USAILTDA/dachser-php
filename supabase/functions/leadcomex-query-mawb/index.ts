import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEADCOMEX_API_URL = 'https://api.leadcomex.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mawb } = await req.json();
    
    if (!mawb) {
      return new Response(
        JSON.stringify({ error: 'MAWB é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = Deno.env.get('LEADCOMEX_API_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token LeadComex não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // A API LeadComex NÃO permite busca direta por MAWB
    // Precisamos buscar houses no período e filtrar pelo MAWB associado
    console.log(`[LEADCOMEX] Buscando MAWB: ${mawb}`);
    
    // Buscar houses nos últimos 15 dias
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - 15);
    
    const periodoInicio = inicio.toISOString().split('T')[0] + 'T00:00:00';
    const periodoFim = hoje.toISOString().split('T')[0] + 'T23:59:59';
    
    const housesUrl = new URL(`${LEADCOMEX_API_URL}/api/ext/houses`);
    housesUrl.searchParams.append('periodoInicio', periodoInicio);
    housesUrl.searchParams.append('periodoFim', periodoFim);
    
    console.log(`[LEADCOMEX] Buscando houses de ${periodoInicio} a ${periodoFim}`);
    
    const housesResponse = await fetch(housesUrl.toString(), {
      method: 'GET',
      headers: {
        'Token': token,
        'Content-Type': 'application/json',
      },
    });
    
    console.log(`[LEADCOMEX] Houses response status: ${housesResponse.status}`);

    if (housesResponse.status === 204 || !housesResponse.ok) {
      return new Response(
        JSON.stringify({ 
          found: false, 
          mawb,
          message: 'Nenhum house encontrado na LeadComex nos últimos 15 dias',
          search_method: 'houses'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const houses = await housesResponse.json();
    console.log(`[LEADCOMEX] Encontrados ${houses.length} houses no período`);
    
    // Normalizar o MAWB para busca
    const mawbNormalizado = mawb.replace(/[\s\-]/g, '').toUpperCase();
    const mawbVariations = [
      mawbNormalizado,
      mawb.toUpperCase(),
      mawb.replace(/-/g, ''),
      mawbNormalizado.slice(-8) // Últimos 8 dígitos
    ];
    
    console.log(`[LEADCOMEX] Variações do MAWB para busca:`, mawbVariations);
    
    // Buscar detalhes de cada house para encontrar o MAWB
    const matchingHouses: Array<{
      hawb: string;
      dataEmissao: string;
      mawbAssociado: string;
      situacao: string;
      detalhes: Record<string, unknown>;
    }> = [];
    
    // Limitar a 100 para performance mas aumentar para encontrar mais matches
    const housesToScan = houses.slice(0, 100);
    
    for (const house of housesToScan) {
      try {
        const detailUrl = new URL(`${LEADCOMEX_API_URL}/api/ext/conhecimentos-carga`);
        detailUrl.searchParams.append('hawb', house.hawb);
        detailUrl.searchParams.append('dataEmissao', house.dataEmissao.split(' ')[0]);
        detailUrl.searchParams.append('exibirCargaDetalhada', 'true');
        
        const detailResponse = await fetch(detailUrl.toString(), {
          method: 'GET',
          headers: { 'Token': token, 'Content-Type': 'application/json' },
        });
        
        if (detailResponse.ok && detailResponse.status !== 204) {
          const detail = await detailResponse.json();
          const cargaData = detail.conhecimentoCargaDetalhada || detail.conhecimentoCargaDetalhado || {};
          const mawbAssociado = cargaData.nroMawbAssociado || cargaData.mawbAssociado || '';
          const mawbAssociadoNorm = mawbAssociado.replace(/[\s\-]/g, '').toUpperCase();
          
          // Verificar se o MAWB associado corresponde
          const isMatch = mawbVariations.some(v => 
            mawbAssociadoNorm === v || 
            mawbAssociadoNorm.includes(v) || 
            v.includes(mawbAssociadoNorm)
          );
          
          if (isMatch) {
            console.log(`[LEADCOMEX] Match encontrado: HAWB=${house.hawb}, MAWB=${mawbAssociado}`);
            matchingHouses.push({
              hawb: house.hawb,
              dataEmissao: house.dataEmissao,
              mawbAssociado,
              situacao: detail.identificacao?.situacaoLead || detail.identificacao?.situacaoPortal || 'N/A',
              detalhes: {
                origem: cargaData.codigoAeroportoOrigemConhecimento,
                destino: cargaData.codigoAeroportoDestinoConhecimento,
                pesoBruto: cargaData.pesoBrutoConhecimento || cargaData.pesoBruto,
                pesoTaxado: cargaData.pesoTaxado,
                volumes: cargaData.quantidadeVolumesConhecimento || cargaData.quantidadeVolumes,
                consignatario: cargaData.nomeConsignatarioConhecimento,
                cnpjConsignatario: cargaData.identificacaoDocumentoConsignatario,
                descricao: cargaData.descricaoResumida,
                bloqueiosAtivos: cargaData.bloqueiosAtivos,
                bloqueiosBaixados: cargaData.bloqueiosBaixados,
                divergencias: cargaData.divergencias,
                situacaoCarga: cargaData.situacaoCarga,
                situacao: cargaData.situacao,
                dataUltimaAtualizacao: detail.identificacao?.dataUltimaAtualizacaoCargaDetalhada,
                dataIntegracao: detail.identificacao?.dataIntegracaoLead
              }
            });
          }
        }
        
        // Rate limit - 50ms entre requests
        await new Promise(r => setTimeout(r, 50));
      } catch (e) {
        console.error(`[LEADCOMEX] Erro ao buscar detalhes de ${house.hawb}:`, e);
      }
    }
    
    if (matchingHouses.length > 0) {
      return new Response(
        JSON.stringify({ 
          found: true, 
          mawb,
          search_method: 'houses_scan',
          total_houses_in_period: houses.length,
          total_houses_scanned: housesToScan.length,
          total_matches: matchingHouses.length,
          matches: matchingHouses
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        found: false, 
        mawb,
        message: 'MAWB não encontrado na LeadComex nos últimos 15 dias',
        search_method: 'houses_scan',
        total_houses_in_period: houses.length,
        total_houses_scanned: housesToScan.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LEADCOMEX] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
