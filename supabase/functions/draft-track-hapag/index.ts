const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContainerEvent {
  type: string;
  containerNo: string;
  status: string;
  date: string;
  placeOfActivity: string;
}

interface BookingInfo {
  bookingNumber: string;
  bookingCreationDate: string | null;
  documentId: string | null;
  transportDocumentReference: string | null;
  vesselName: string | null;
  vesselIMO: string | null;
  voyageNumber: string | null;
  originLocation: string | null;
  originCode: string | null;
  destinationLocation: string | null;
  destinationCode: string | null;
  etd: string | null;
  eta: string | null;
  containerType: string | null;
  commodity: string | null;
  documentStatus: string | null;
  yourReference: string | null;
}

interface ApiMetadata {
  transactionId: string | null;
  serverTimestamp: string | null;
  requestTimestamp: string;
  apiEndpoint: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestTimestamp = new Date().toISOString();
  let bookingNumber: string;

  try {
    const body = await req.json();
    bookingNumber = body.bookingNumber;
  } catch (parseError) {
    console.error('Failed to parse request body:', parseError);
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!bookingNumber) {
    return new Response(
      JSON.stringify({ success: false, error: 'Booking number is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const clientId = Deno.env.get('HAPAG_CLIENT_ID');
    const apiKey = Deno.env.get('HAPAG_API_KEY');

    if (!clientId || !apiKey) {
      console.error('Hapag-Lloyd API credentials not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'API credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching tracking data from Hapag-Lloyd API for booking:', bookingNumber);

    const apiUrl = `https://api.hlag.com/hlag/external/v2/events/?carrierBookingReference=${encodeURIComponent(bookingNumber)}`;

    console.log('API URL:', apiUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-IBM-Client-Id': clientId,
          'X-IBM-Client-Secret': apiKey,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: `Connection failed: ${fetchError instanceof Error ? fetchError.message : 'Unknown'}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    clearTimeout(timeoutId);
    
    const transactionId = response.headers.get('x-global-transaction-id');
    const serverTimestamp = response.headers.get('date');
    
    console.log('API Response status:', response.status);
    console.log('Transaction ID:', transactionId);

    let responseText = '';
    try {
      responseText = await response.text();
      console.log('Response body:', responseText);
    } catch (readErr) {
      console.log('Could not read response body:', readErr);
    }

    if (response.status === 401 || response.status === 403) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authentication failed',
          status: response.status,
          details: responseText || 'No response body',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      console.error('Hapag-Lloyd API error:', response.status, responseText);
      
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ success: false, error: 'Booking not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after') || '30';
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'rate_limit',
            message: `Limite de requisições atingido. Aguarde ${retryAfter} segundos.`,
            retryAfter: parseInt(retryAfter, 10),
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `API error: ${response.status}`, details: responseText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('Failed to parse JSON:', jsonError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON response from API', rawResponse: responseText.substring(0, 1000) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Hapag-Lloyd API response received, data keys:', Object.keys(data));

    const containers: ContainerEvent[] = [];
    const containerMap = new Map<string, ContainerEvent>();
    const events = Array.isArray(data) ? data : (data.events || []);
    
    console.log('Number of events:', events.length);

    const bookingInfo: BookingInfo = {
      bookingNumber,
      bookingCreationDate: null,
      documentId: null,
      transportDocumentReference: null,
      vesselName: null,
      vesselIMO: null,
      voyageNumber: null,
      originLocation: null,
      originCode: null,
      destinationLocation: null,
      destinationCode: null,
      etd: null,
      eta: null,
      containerType: null,
      commodity: null,
      documentStatus: null,
      yourReference: null,
    };

    const allEvents: any[] = [];

    for (const event of events) {
      const containerNo = event.equipmentReference || event.containerNumber || '';
      
      allEvents.push({
        eventType: event.eventType,
        eventCode: event.equipmentEventTypeCode || event.transportEventTypeCode || event.shipmentEventTypeCode,
        dateTime: event.eventDateTime,
        location: event.eventLocation?.locationName || event.transportCall?.location?.locationName || '',
        locationCode: event.eventLocation?.UNLocationCode || event.transportCall?.UNLocationCode || '',
        facilityName: event.eventLocation?.address?.name || event.transportCall?.location?.address?.name || '',
        vesselName: event.transportCall?.vessel?.vesselName || null,
        vesselIMO: event.transportCall?.vessel?.vesselIMONumber || null,
        voyageNumber: event.transportCall?.exportVoyageNumber || event.transportCall?.importVoyageNumber || null,
        containerNo,
        containerType: event.ISOEquipmentCode || '',
        emptyIndicator: event.emptyIndicatorCode || '',
        documentId: event.documentID || null,
        documentType: event.documentTypeCode || null,
      });

      if (event.shipmentEventTypeCode === 'CONF' && event.documentTypeCode === 'BKG') {
        bookingInfo.bookingCreationDate = event.eventDateTime?.split('T')[0] || null;
        bookingInfo.documentId = event.documentID || null;
      }

      if (event.shipmentEventTypeCode === 'ISSU' && event.documentTypeCode === 'TRD') {
        bookingInfo.transportDocumentReference = event.documentID || null;
      }

      if (event.transportCall?.vessel?.vesselName && !bookingInfo.vesselName) {
        bookingInfo.vesselName = event.transportCall.vessel.vesselName;
        bookingInfo.vesselIMO = event.transportCall.vessel.vesselIMONumber;
        bookingInfo.voyageNumber = event.transportCall.exportVoyageNumber || event.transportCall.importVoyageNumber;
      }

      if (event.transportEventTypeCode === 'DEPA' && !bookingInfo.originLocation) {
        bookingInfo.originLocation = event.transportCall?.location?.locationName || event.transportCall?.UNLocationCode || '';
        bookingInfo.originCode = event.transportCall?.UNLocationCode || null;
        bookingInfo.etd = event.eventDateTime?.split('T')[0] || null;
      }

      if (event.transportEventTypeCode === 'ARRI') {
        bookingInfo.destinationLocation = event.transportCall?.location?.locationName || event.transportCall?.UNLocationCode || '';
        bookingInfo.destinationCode = event.transportCall?.UNLocationCode || null;
        bookingInfo.eta = event.eventDateTime?.split('T')[0] || null;
      }

      if (event.ISOEquipmentCode && !bookingInfo.containerType) {
        bookingInfo.containerType = event.ISOEquipmentCode;
      }

      if (event.commodityDescription && !bookingInfo.commodity) {
        bookingInfo.commodity = event.commodityDescription;
      }

      if (event.documentTypeCode === 'TRD') {
        if (event.shipmentEventTypeCode === 'ISSU') {
          bookingInfo.documentStatus = 'Completed';
        } else if (event.shipmentEventTypeCode === 'CONF' && bookingInfo.documentStatus !== 'Completed') {
          bookingInfo.documentStatus = 'In Progress';
        }
      }

      if (event.shipmentEventTypeCode === 'ISSU' && event.documentTypeCode === 'BKG') {
        if (bookingInfo.documentStatus !== 'Completed') {
          bookingInfo.documentStatus = 'In Progress';
        }
      }

      if (containerNo && !containerMap.has(containerNo)) {
        containerMap.set(containerNo, {
          type: event.ISOEquipmentCode || event.equipmentType || '',
          containerNo: containerNo,
          status: event.equipmentEventTypeCode || event.eventType || 'Unknown',
          date: event.eventDateTime?.split('T')[0] || event.eventCreatedDateTime?.split('T')[0] || '',
          placeOfActivity: event.eventLocation?.locationName || event.transportCall?.location?.locationName || '',
        });
      }
    }

    containers.push(...containerMap.values());
    allEvents.sort((a, b) => new Date(b.dateTime || 0).getTime() - new Date(a.dateTime || 0).getTime());

    if (bookingInfo.transportDocumentReference && !bookingInfo.documentStatus) {
      bookingInfo.documentStatus = 'Completed';
    } else if (!bookingInfo.documentStatus) {
      bookingInfo.documentStatus = 'Pending';
    }

    console.log('Total containers found:', containers.length);
    console.log('Booking info:', JSON.stringify(bookingInfo));

    const apiMetadata: ApiMetadata = {
      transactionId,
      serverTimestamp,
      requestTimestamp,
      apiEndpoint: apiUrl,
    };

    return new Response(
      JSON.stringify({ 
        success: true, 
        bookingNumber,
        bookingInfo,
        containers,
        events: allEvents,
        totalEvents: events.length,
        apiMetadata,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error tracking:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
