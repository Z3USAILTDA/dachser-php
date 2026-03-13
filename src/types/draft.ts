// Status de sincronização dos MBLs
export type SyncStatus = 
  | 'Completed' 
  | 'In Progress' 
  | 'Pending' 
  | 'Error' 
  | 'Rate Limited' 
  | 'Unknown'
  | 'Nunca Consultado';

// Registro do MariaDB (t_master_dados)
export interface MBLRecord {
  mbl_id: string;
  tipo_processo: string;
  shipper?: string | null;
}

// Dados de tracking (t_consulta_armador)
export interface TrackingData {
  id: number;
  mbl_id: string;
  booking: string | null;
  origem: string | null;
  destino: string | null;
  navio: string | null;
  voyage: string | null;
  etd: string | null;
  eta: string | null;
  tipo_processo: string | null;
  status_armador: string | null;
  transaction_id: string | null;
  hash_hapag_lloyd: string | null;
  api_endpoint: string | null;
  data_hora_servidor: string | null;
  data_hora_consulta: string | null;
  created_at: string | null;
}

// Localização de evento
export interface EventLocation {
  locationName: string;
  UNLocationCode: string;
  address?: { name: string };
}

// Transport Call
export interface TransportCall {
  vessel?: {
    vesselName: string;
    vesselIMONumber: string;
  };
  exportVoyageNumber?: string;
  importVoyageNumber?: string;
  location?: {
    locationName: string;
    UNLocationCode: string;
  };
}

// Evento individual da API Hapag-Lloyd
export interface HapagEvent {
  eventType: 'EQUIPMENT' | 'TRANSPORT' | 'SHIPMENT';
  eventCode: string;
  dateTime: string;
  location: string;
  locationCode: string;
  facilityName?: string;
  vesselName?: string | null;
  vesselIMO?: string | null;
  vesselFlag?: string | null;
  vesselFlagName?: string | null;
  voyageNumber?: string | null;
  containerNo?: string;
  containerType?: string;
  emptyIndicator?: string;
  documentId?: string | null;
  documentType?: string | null;
  description?: string | null;
  statusCode?: string | null;
  order?: number | null;
}

// Informações de container (campos da API Hapag-Lloyd)
export interface ContainerInfo {
  containerNo: string;
  type: string;
  status: string;
  date: string;
  placeOfActivity: string;
}

// Informações consolidadas do booking (campos da API Hapag-Lloyd)
export interface BookingInfo {
  bookingNumber: string;
  transportDocumentReference: string;
  vesselName: string;
  vesselIMO?: string;
  vesselFlag?: string | null;
  vesselFlagName?: string | null;
  voyageNumber: string;
  originLocation: string;
  originCode: string;
  destinationLocation: string;
  destinationCode: string;
  etd: string | null;
  eta: string | null;
  documentStatus: string;
  bookingCreationDate?: string;
  containerType?: string;
  numberOfContainers?: number | null;
  commodity?: string | null;
  yourReference?: string | null;
}

// Dados combinados MBL + Status
export interface CombinedMBLData {
  mbl_id: string;
  tipo_processo: string;
  shipper?: string | null;
  trackingData: TrackingData | null;
  status: SyncStatus;
  lastConsulted: string | null;
}

// Estatísticas do dashboard
export interface DraftStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  error: number;
  neverConsulted: number;
}

// Resultado de processamento em lote
export interface BatchProcessResult {
  mbl_id: string;
  success: boolean;
  status?: SyncStatus;
  booking?: string;
  error?: string;
}

// Metadados da API (prova de autenticidade)
export interface ApiMetadata {
  transactionId?: string;
  serverDateTime?: string;
  clientDateTime?: string;
  apiEndpoint?: string;
  requestedAt?: string;
  endpoint?: string;
}

// Response da API de tracking
export interface TrackingApiResponse {
  success: boolean;
  carrier?: string;
  bookingNumber?: string;
  bookingInfo?: BookingInfo;
  containers?: ContainerInfo[];
  events?: HapagEvent[];
  totalEvents?: number;
  error?: string;
  apiMetadata?: ApiMetadata;
}
