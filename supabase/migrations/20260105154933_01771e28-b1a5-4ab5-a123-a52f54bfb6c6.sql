-- Tabela para armazenar requisições de análise CHB (padrão async/polling)
CREATE TABLE IF NOT EXISTS public.chb_analysis_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id INTEGER NOT NULL,
  step_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  request_payload JSONB,
  result_html TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Índice para consultas rápidas por status
CREATE INDEX idx_chb_analysis_requests_status ON public.chb_analysis_requests(id, status);

-- Índice para buscar por item
CREATE INDEX idx_chb_analysis_requests_item ON public.chb_analysis_requests(item_id, step_id);

-- Habilitar RLS
ALTER TABLE public.chb_analysis_requests ENABLE ROW LEVEL SECURITY;

-- Política: permitir todas operações (função não usa JWT)
CREATE POLICY "Allow all access to chb_analysis_requests" 
  ON public.chb_analysis_requests 
  FOR ALL 
  USING (true)
  WITH CHECK (true);