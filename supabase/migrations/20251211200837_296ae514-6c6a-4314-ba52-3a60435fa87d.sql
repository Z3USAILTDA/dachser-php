-- CCT Status Atual - Status corrente do shipment
CREATE TABLE IF NOT EXISTS public.cct_status_atual (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  status_cct_oficial TEXT NOT NULL DEFAULT 'AGUARDANDO_MANIFESTACAO',
  status_handler TEXT,
  sla_status TEXT NOT NULL DEFAULT 'OK' CHECK (sla_status IN ('OK', 'ALERTA', 'CRITICO')),
  sla_limite TIMESTAMPTZ,
  tipo_voo TEXT CHECK (tipo_voo IN ('VOO_CURTO', 'VOO_LONGO')),
  ultima_atualizacao TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shipment_id)
);

-- CCT Evento Normalizado - Timeline de eventos
CREATE TABLE IF NOT EXISTS public.cct_evento_normalizado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  codigo_evento TEXT NOT NULL,
  descricao_evento TEXT,
  data_hora_evento TIMESTAMPTZ NOT NULL DEFAULT now(),
  fonte TEXT CHECK (fonte IN ('RFB', 'HANDLER', 'LEADCOMEX', 'MANUAL')),
  aeroporto TEXT,
  nivel_confianca TEXT DEFAULT 'PRIMARIA' CHECK (nivel_confianca IN ('PRIMARIA', 'COMPLEMENTAR')),
  detalhes_raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CCT Exceção Operacional - Alertas e exceções
CREATE TABLE IF NOT EXISTS public.cct_excecao_operacional (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  tipo_excecao TEXT NOT NULL CHECK (tipo_excecao IN ('DIVERGENCIA_DADOS', 'ATRASO_EVENTO', 'HOUSE_NAO_ENCONTRADO', 'API_INDISPONIVEL')),
  descricao TEXT NOT NULL,
  fonte_detectou TEXT,
  status_excecao TEXT NOT NULL DEFAULT 'ABERTA' CHECK (status_excecao IN ('ABERTA', 'RESOLVIDA', 'EM_ANALISE')),
  resolvido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cct_status_atual ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cct_evento_normalizado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cct_excecao_operacional ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cct_status_atual
CREATE POLICY "Authenticated users can view cct_status_atual" 
ON public.cct_status_atual FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert cct_status_atual" 
ON public.cct_status_atual FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update cct_status_atual" 
ON public.cct_status_atual FOR UPDATE USING (true);

-- RLS Policies for cct_evento_normalizado
CREATE POLICY "Authenticated users can view cct_evento_normalizado" 
ON public.cct_evento_normalizado FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert cct_evento_normalizado" 
ON public.cct_evento_normalizado FOR INSERT WITH CHECK (true);

-- RLS Policies for cct_excecao_operacional
CREATE POLICY "Authenticated users can view cct_excecao_operacional" 
ON public.cct_excecao_operacional FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert cct_excecao_operacional" 
ON public.cct_excecao_operacional FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update cct_excecao_operacional" 
ON public.cct_excecao_operacional FOR UPDATE USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cct_status_shipment ON public.cct_status_atual(shipment_id);
CREATE INDEX IF NOT EXISTS idx_cct_eventos_shipment ON public.cct_evento_normalizado(shipment_id);
CREATE INDEX IF NOT EXISTS idx_cct_eventos_data ON public.cct_evento_normalizado(data_hora_evento DESC);
CREATE INDEX IF NOT EXISTS idx_cct_excecoes_shipment ON public.cct_excecao_operacional(shipment_id);
CREATE INDEX IF NOT EXISTS idx_cct_excecoes_status ON public.cct_excecao_operacional(status_excecao);

-- Trigger to update updated_at
CREATE TRIGGER update_cct_status_updated_at
BEFORE UPDATE ON public.cct_status_atual
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cct_excecao_updated_at
BEFORE UPDATE ON public.cct_excecao_operacional
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();