import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SEARCH_URL = 'https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/search';
const COP_EVENTS_URL = 'https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/cop-events';

const statusMap: Record<string, string> = {
  'Empty Container Release to Shipper': 'CLT',
  'Empty to Shipper': 'CLT',
  'Gate In at Origin CY': 'GIO',
  'Export Received at CY': 'GIO',
  'Full Container Received at CY': 'GIO',
  'Full Export Received at CY': 'GIO',
  'Loaded on Vessel': 'CRG',
  'Full Export Load': 'CRG',
  'Export Loaded on Vessel': 'CRG',
  'Full Transshipment Discharged': 'TSP',
  'Empty Transshipment Discharged': 'TSP',
  'Full Transshipment Loaded': 'TSP',
  'Empty Transshipment Loaded': 'TSP',
  'Discharged from Vessel': 'DCH',
  'Full Import Discharge': 'DCH',
  'Import Discharged from Vessel': 'DCH',
  'Gate Out at Destination CY': 'GOD',
  'Full Container Delivery': 'GOD',
  'Import to Consignee': 'GOD',
  'Full Import Delivery': 'GOD',
  'DLV': 'DLV',
  'Delivered': 'DLV',
  'Empty Container Returned from Customer': 'DLV',
  'Empty Returned from Customer': 'DLV',
  'Empty received at CY': 'DLV',
  'Empty Container Return to CY': 'DLV',
};

function stripOneyPrefix(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper.startsWith('ONEY')) {
    return value.trim().substring(4);
  }
  return value.trim();
}

function mapSearchType(searchType: string): string {
  if (searchType === 'container') return 'CTR_NO';
  if (searchType === 'booking') return 'BKG_NO';
  return 'BL_NO';
}

function deriveStatus(latestEventName: string, delivered: boolean): string {
  if (delivered) return 'DLV';
  const clean = (latestEventName || '').trim();
  if (statusMap[clean]) return statusMap[clean];
  for (const [key, value] of Object.entries(statusMap)) {
    if (clean.toLowerCase() === key.toLowerCase()) return value;
  }
  return clean || 'In Progress';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { searchType = 'bl', searchValue } = await req.json();
    console.log(`ONE tracking request - Type: ${searchType}, Value: ${searchValue}`);

    if (!searchValue) {
      return new Response(
        JSON.stringify({ success: false, error: 'Número de rastreamento é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const oneCookie = Deno.env.get('ONE_COOKIE') || '';
    const requestTimestamp = new Date().toISOString();
    const cleanValue = stripOneyPrefix(searchValue);
    console.log(`ONE: original="${searchValue}", cleaned="${cleanValue}"`);

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Origin': 'https://ecomm.one-line.com',
      'Referer': 'https://ecomm.one-line.com/one-ecom/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
      'Content-Type': 'application/json',
    };
    if (oneCookie) headers['Cookie'] = oneCookie;

    const timestamp = Date.now();
    const searchPayload = {
      page: 1,
      page_length: 10,
      filters: {
        search_text: cleanValue,
        search_type: mapSearchType(searchType),
      },
      timestamp,
    };

    const searchResponse = await fetch(SEARCH_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(searchPayload),
    });

    const searchText = await searchResponse.text();
    console.log('ONE search status:', searchResponse.status);

    if (searchResponse.status === 429) {
      return new Response(
        JSON.stringify({ success: false, error: 'rate_limit', message: 'Limite de requisições ONE atingido. Aguarde alguns minutos.', retryAfter: 60 }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!searchResponse.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro da API ONE: ${searchResponse.status}` }),
        { status: searchResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let searchJson: any;
    try {
      searchJson = JSON.parse(searchText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Resposta inválida da API ONE (search)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = Array.isArray(searchJson?.data) ? searchJson.data[0] : null;

    if (!searchData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum resultado encontrado para este número na ONE' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const bookingNo = (searchData.bookingNo as string) || cleanValue;

    const copUrl = `${COP_EVENTS_URL}?booking_no=${encodeURIComponent(bookingNo)}`;
    const copResponse = await fetch(copUrl, { method: 'GET', headers });
    const copText = await copResponse.text();

    let copJson: any = null;
    try {
      copJson = JSON.parse(copText);
    } catch {
      console.warn('ONE cop-events: failed to parse JSON');
    }

    const latestEventName = (searchData?.latestEvent?.eventName as string) || '';
    const deliveredKeywords = ['dlv', 'delivered', 'empty container returned', 'empty returned', 'empty received at cy', 'empty container return to cy'];
    const delivered = deliveredKeywords.some(kw => latestEventName.toLowerCase().includes(kw));
    const documentStatus = deriveStatus(latestEventName, delivered);

    const portoOrigem = [searchData?.por?.locationName, searchData?.por?.countryName].filter(Boolean).join(' - ') || null;
    const portoDestino = [searchData?.pod?.locationName, searchData?.pod?.countryName].filter(Boolean).join(' - ') || null;

    const containerNo = (searchData?.containerNo as string) || null;
    const containerType = (searchData?.containerTypeSize as string) || null;
    const vesselVoyage = searchData?.vesselVoyage != null ? String(searchData.vesselVoyage) : null;

    let vesselName: string | null = null;
    let voyageNumber: string | null = null;
    if (vesselVoyage) {
      const parts = vesselVoyage.split('/');
      vesselName = parts[0]?.trim() || null;
      voyageNumber = parts[1]?.trim().replace(/^V\./, '') || null;
    }

    const eta = (searchData?.podEta as string) || (searchData?.latestSchedule?.podEta as string) || null;
    const etd = (searchData?.polEtd as string) || (searchData?.latestSchedule?.polEtd as string) || null;
    const blNumber = (searchData?.blNo as string) || null;

    const containers: { type: string; containerNo: string; status: string; date: string; placeOfActivity: string }[] = [];
    if (containerNo) {
      const latestLocation = searchData?.latestEvent?.location;
      const latestLocationStr = typeof latestLocation === 'object' && latestLocation !== null
        ? [(latestLocation as any).locationName, (latestLocation as any).countryName].filter(Boolean).join(', ')
        : String(latestLocation || '');
      containers.push({
        type: containerType || 'EQUIPMENT',
        containerNo,
        status: documentStatus,
        date: latestEventName ? (searchData?.latestEvent?.eventDate as string || searchData?.latestEvent?.date as string || '') : '',
        placeOfActivity: latestLocationStr,
      });
    }

    const timeline: any[] = Array.isArray(copJson?.data) ? copJson.data : [];
    const allEvents: Record<string, unknown>[] = timeline.map((ev: any) => {
      const desc = (ev?.eventName as string) || '';
      const eventCode = desc.includes('Delivered') ? 'DLVD' :
        desc.includes('Loaded') ? 'LOAD' :
        desc.includes('Discharged') ? 'DISC' :
        desc.includes('Departed') || desc.includes('Departure') ? 'DEPA' :
        desc.includes('Arrived') || desc.includes('Arrival') ? 'ARRI' :
        desc.includes('Gate out') || desc.includes('Gate Out') ? 'GTOT' :
        desc.includes('Gate in') || desc.includes('Gate In') ? 'GTIN' : 'INFO';

      const locationRaw = ev?.location;
      const locationStr = typeof locationRaw === 'object' && locationRaw !== null
        ? [(locationRaw as any).locationName, (locationRaw as any).countryName].filter(Boolean).join(', ')
        : String(locationRaw || '');

      return {
        eventType: 'SHIPMENT',
        eventCode,
        description: desc || null,
        statusCode: null,
        dateTime: (ev?.eventDate as string) || '',
        location: locationStr,
        locationCode: '',
        facilityName: '',
        vesselName: (ev?.vessel as string) || null,
        vesselIMO: null,
        vesselFlag: null,
        vesselFlagName: null,
        voyageNumber: (ev?.voyage as string) || null,
        containerNo: containerNo || '',
        containerType: containerType || '',
        order: null,
        emptyIndicator: '',
        documentId: null,
        documentType: null,
      };
    });

    const bookingInfo = {
      bookingNumber: searchValue,
      bookingCreationDate: null,
      documentId: null,
      transportDocumentReference: blNumber,
      vesselName,
      vesselIMO: null,
      vesselFlag: null,
      vesselFlagName: null,
      voyageNumber,
      originLocation: portoOrigem,
      originCode: (searchData?.por?.locationCode as string) || null,
      destinationLocation: portoDestino,
      destinationCode: (searchData?.pod?.locationCode as string) || null,
      etd,
      eta,
      containerType: containerType ? `${containerType}` : (containerNo ? '1 container(s)' : null),
      numberOfContainers: containerNo ? 1 : null,
      commodity: null,
      documentStatus,
      yourReference: null,
    };

    const apiMetadata = {
      transactionId: `ONE-${Date.now()}-${cleanValue}`,
      serverTimestamp: new Date().toISOString(),
      requestTimestamp,
      apiEndpoint: SEARCH_URL,
    };

    console.log(`ONE tracking success - Container: ${containerNo}, status: ${documentStatus}, events: ${allEvents.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        carrier: 'ONE',
        bookingNumber: blNumber || searchValue,
        bookingInfo,
        containers,
        events: allEvents,
        totalEvents: allEvents.length,
        apiMetadata,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('ONE tracking error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
