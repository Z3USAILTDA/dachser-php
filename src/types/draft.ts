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
  equipmentEventTypeCode?: string;
  transportEventTypeCode?: string;
  shipmentEventTypeCode?: string;
  eventDateTime: string;
  documentID?: string;
  documentTypeCode?: string;
  carrierBookingReference?: string;
  transportDocumentReference?: string;
  equipmentReference?: string;
  ISOEquipmentCode?: string;
  emptyIndicatorCode?: string;
  eventLocation?: EventLocation;
  transportCall?: TransportCall;
}

// Informações de container
export interface ContainerInfo {
  equipmentReference: string;
  ISOEquipmentCode: string;
  emptyIndicatorCode: string;
  events: HapagEvent[];
}

// Informações consolidadas do booking
export interface BookingInfo {
  bookingReference: string;
  transportDocumentReference: string;
  vesselName: string;
  voyage: string;
  polCode: string;
  polName: string;
  podCode: string;
  podName: string;
  etd: string | null;
  eta: string | null;
  documentStatus: SyncStatus;
}

// Dados combinados MBL + Status
export interface CombinedMBLData {
  mbl_id: string;
  tipo_processo: string;
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

// Response da API de tracking
export interface TrackingApiResponse {
  success: boolean;
  bookingInfo?: BookingInfo;
  containers?: ContainerInfo[];
  events?: HapagEvent[];
  error?: string;
  apiMetadata?: {
    requestedAt: string;
    endpoint: string;
    transactionId?: string;
  };
}
