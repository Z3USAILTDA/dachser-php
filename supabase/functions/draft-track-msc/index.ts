import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MSCEvent {
  Description?: string;
  Date?: string;
  Location?: string;
  Detail?: string[];
  Order?: number;
  StatusCode?: string;
  Vessel?: {
    IMO?: string;
    Built?: string;
    Flag?: string;
    FlagName?: string;
  } | null;
}

interface MSCContainerInfo {
  ContainerNumber?: string;
  ContainerType?: string;
  Events?: MSCEvent[];
  Delivered?: boolean;
}

interface MSCGeneralTrackingInfo {
  ShippedFrom?: string;
  ShippedTo?: string;
  PortOfLoad?: string;
  PortOfDischarge?: string;
  FinalPodEtaDate?: string;
}

interface MSCBillOfLading {
  BolNumber?: string;
  BillOfLadingNumber?: string;
  GeneralTrackingInfo?: MSCGeneralTrackingInfo;
  ContainersInfo?: MSCContainerInfo[];
  NumberOfContainers?: number;
  Delivered?: boolean;
}

interface MSCResponse {
  IsSuccess?: boolean;
  Data?: {
    BillOfLadings?: MSCBillOfLading[];
    Delivered?: boolean;
  } | string;
  ContainersInfo?: MSCContainerInfo[];
  Delivered?: boolean;
}

const statusMap: Record<string, string> = {
  'Empty to Shipper': 'CLT',
  'Export received at CY': 'GIO',
  'Export Loaded on Vessel': 'CRG',
  'Import Discharged from Vessel': 'DCH',
  'Import to consignee': 'GOD',
};

function detectTrackingMode(searchValue: string, searchType: string): number {
  const prefix = searchValue.trim().substring(0, 4).toUpperCase();
  if (prefix === 'EBKG') return 1;
  if (prefix === 'MEDU' || prefix === 'MSC ') return 0;
  if (searchType === 'booking') return 1;
  return 0;
}

function deriveStatus(events: MSCEvent[], delivered: boolean | null): string {
  if (delivered === true) return 'DLV';
  if (!events || events.length === 0) return 'Pending';
  const sorted = [...events].sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));
  const penEvent = sorted.length > 1 ? sorted[sorted.length - 2] : sorted[sorted.length - 1];
  if (penEvent.StatusCode === 'TSP') return 'TSP';
  const desc = penEvent.Description ?? '';
  for (const [key, value] of Object.entries(statusMap)) {
    if (desc.toLowerCase() === key.toLowerCase()) return value;
  }
  return penEvent.StatusCode ?? (desc || 'In Progress');
}

function extractVesselFromEvents(events: MSCEvent[]): { imo: string | null; name: string | null; flag: string | null; flagName: string | null } {
  if (!events || events.length === 0) return { imo: null, name: null, flag: null, flagName: null };
  const sorted = [...events].sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i].Vessel;
    if (v && v.IMO) {
      return { imo: v.IMO, name: null, flag: v.Flag ?? null, flagName: v.FlagName ?? null };
    }
  }
  const penEvent = sorted.length > 1 ? sorted[sorted.length - 2] : sorted[sorted.length - 1];
  const detail = penEvent.Detail || [];
  return { imo: null, name: detail[0] || null, flag: null, flagName: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchType = 'bl', searchValue } = await req.json();
    console.log(`MSC tracking request - Type: ${searchType}, Value: ${searchValue}`);

    if (!searchValue) {
      return new Response(
        JSON.stringify({ success: false, error: 'Número de rastreamento é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mscCookie = Deno.env.get('MSC_COOKIE') || '';
    const trackingMode = detectTrackingMode(searchValue, searchType);
    const apiUrl = 'https://www.msc.com/api/feature/tools/TrackingInfo';
    const requestTimestamp = new Date().toISOString();

    const payload = { trackingNumber: searchValue.trim(), trackingMode };
    console.log('MSC API request payload:', JSON.stringify(payload));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Origin': 'https://www.msc.com',
      'Referer': 'https://www.msc.com/en/track-a-shipment',
      'X-Requested-With': 'XMLHttpRequest',
      'Cache-Control': 'no-cache',
    };
    if (mscCookie) headers['Cookie'] = mscCookie;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('MSC API response status:', response.status);

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ success: false, error: 'rate_limit', message: 'Limite de requisições MSC atingido. Aguarde alguns minutos.', retryAfter: 60 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro da API MSC: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!responseText || responseText.trim() === '') {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum resultado encontrado para este número' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let mscData: MSCResponse;
    try {
      mscData = JSON.parse(responseText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida da API MSC' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mscData.IsSuccess === false) {
      const errorMessage = typeof mscData.Data === 'string' ? mscData.Data : 'Nenhum resultado encontrado';
      return new Response(
        JSON.stringify({ success: false, error: errorMessage, suggestion: 'Tente buscar pelo MBL ou número do container' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = typeof mscData.Data === 'object' ? mscData.Data : {};
    const billOfLadings = (data as { BillOfLadings?: MSCBillOfLading[] }).BillOfLadings || [];
    const containersInfoRoot = mscData.ContainersInfo || [];

    let origem: string | null = null;
    let destino: string | null = null;
    let eta: string | null = null;
    let blNumber: string | null = null;
    let qtdContainers: number | null = null;
    let deliveredFlag: boolean | null = mscData.Delivered ?? null;
    let vesselInfo = { imo: null as string | null, name: null as string | null, flag: null as string | null, flagName: null as string | null };
    let documentStatus = 'Pending';

    const allContainers: { type: string; containerNo: string; status: string; date: string; placeOfActivity: string }[] = [];
    const allEvents: Record<string, unknown>[] = [];

    if ((data as { Delivered?: boolean }).Delivered !== undefined && deliveredFlag === null) {
      deliveredFlag = (data as { Delivered?: boolean }).Delivered ?? null;
    }

    const processContainers = (containers: MSCContainerInfo[], billDelivered: boolean | null) => {
      for (const container of containers) {
        if (!container) continue;
        const containerNo = container.ContainerNumber || 'N/A';
        const containerType = container.ContainerType || 'N/A';
        const events = container.Events || [];
        const containerDelivered = container.Delivered ?? billDelivered;
        const status = deriveStatus(events, containerDelivered);
        const v = extractVesselFromEvents(events);
        if (!vesselInfo.imo && v.imo) vesselInfo = v;
        if (!vesselInfo.name && v.name) vesselInfo.name = v.name;

        if (events.length > 0) {
          allContainers.push({
            type: 'EQUIPMENT',
            containerNo,
            status,
            date: events[0].Date || '',
            placeOfActivity: events[0].Location || '',
          });
        }

        for (const event of events) {
          if (!event) continue;
          const desc = event.Description || '';
          const eventCode = desc.includes('Delivered') ? 'DLVD' :
            desc.includes('Loaded') ? 'LOAD' :
            desc.includes('Discharged') ? 'DISC' :
            desc.includes('Departed') ? 'DEPA' :
            desc.includes('Arrived') ? 'ARRI' :
            desc.includes('Gate out') ? 'GTOT' :
            desc.includes('Gate in') ? 'GTIN' : 'INFO';

          allEvents.push({
            eventType: 'SHIPMENT',
            eventCode,
            description: event.Description || null,
            statusCode: event.StatusCode || null,
            dateTime: event.Date || '',
            location: event.Location || '',
            locationCode: '',
            facilityName: '',
            vesselName: event.Vessel ? null : (event.Detail?.[0] || null),
            vesselIMO: event.Vessel?.IMO || null,
            vesselFlag: event.Vessel?.Flag || null,
            vesselFlagName: event.Vessel?.FlagName || null,
            voyageNumber: event.Detail?.[1] || null,
            containerNo,
            containerType,
            order: event.Order ?? null,
            emptyIndicator: '',
            documentId: null,
            documentType: null,
          });
        }
      }
    };

    if (billOfLadings.length > 0) {
      for (const bill of billOfLadings) {
        if (!bill) continue;
        if (!blNumber) blNumber = bill.BillOfLadingNumber || bill.BolNumber || null;
        const gti = bill.GeneralTrackingInfo || {};
        if (!origem) origem = gti.PortOfLoad || gti.ShippedFrom || null;
        if (!destino) destino = gti.PortOfDischarge || gti.ShippedTo || null;
        if (!eta) eta = gti.FinalPodEtaDate || null;
        if (!qtdContainers && bill.NumberOfContainers) qtdContainers = bill.NumberOfContainers;
        if (deliveredFlag === null && bill.Delivered !== undefined) deliveredFlag = bill.Delivered;
        processContainers(bill.ContainersInfo || [], bill.Delivered ?? null);
      }
    }

    if (containersInfoRoot.length > 0 && allContainers.length === 0) {
      processContainers(containersInfoRoot, deliveredFlag);
    }

    if (deliveredFlag === true) {
      documentStatus = 'DLV';
    } else if (allEvents.length > 0) {
      documentStatus = allContainers.length > 0 ? allContainers[0].status : 'In Progress';
    }

    const bookingInfo = {
      bookingNumber: searchValue,
      bookingCreationDate: null,
      documentId: null,
      transportDocumentReference: blNumber,
      vesselName: vesselInfo.name,
      vesselIMO: vesselInfo.imo,
      vesselFlag: vesselInfo.flag,
      vesselFlagName: vesselInfo.flagName,
      voyageNumber: null,
      originLocation: origem,
      originCode: null,
      destinationLocation: destino,
      destinationCode: null,
      etd: null,
      eta,
      containerType: qtdContainers ? `${qtdContainers} container(s)` : (allContainers.length > 0 ? `${allContainers.length} container(s)` : null),
      numberOfContainers: qtdContainers || allContainers.length || null,
      commodity: null,
      documentStatus,
      yourReference: null,
    };

    const apiMetadata = {
      transactionId: `MSC-${Date.now()}-${searchValue}`,
      serverTimestamp: new Date().toISOString(),
      requestTimestamp,
      apiEndpoint: apiUrl,
    };

    console.log(`MSC tracking success - Found ${allContainers.length} containers, ${allEvents.length} events, status: ${documentStatus}`);

    return new Response(
      JSON.stringify({
        success: true,
        carrier: 'MSC',
        bookingNumber: blNumber || searchValue,
        bookingInfo,
        containers: allContainers,
        events: allEvents,
        totalEvents: allEvents.length,
        apiMetadata,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('MSC tracking error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
