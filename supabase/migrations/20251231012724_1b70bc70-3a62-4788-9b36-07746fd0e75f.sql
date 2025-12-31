-- Tabela para armazenar histórico de uso por ciclo de faturamento
CREATE TABLE public.api_usage_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_name TEXT NOT NULL,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  total_calls INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  monthly_limit INTEGER,
  usage_percentage NUMERIC(5,2),
  estimated_cost_usd NUMERIC(10,4),
  plan_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(api_name, cycle_start_date)
);

-- Enable RLS
ALTER TABLE public.api_usage_cycles ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view
CREATE POLICY "Authenticated users can view api_usage_cycles"
  ON public.api_usage_cycles
  FOR SELECT
  USING (true);

-- Policy for admins to manage
CREATE POLICY "Admins can manage api_usage_cycles"
  ON public.api_usage_cycles
  FOR ALL
  USING (has_role(auth.uid(), 'ADMIN'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_api_usage_cycles_updated_at
  BEFORE UPDATE ON public.api_usage_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster queries
CREATE INDEX idx_api_usage_cycles_api_name ON public.api_usage_cycles(api_name);
CREATE INDEX idx_api_usage_cycles_cycle_start ON public.api_usage_cycles(cycle_start_date DESC);