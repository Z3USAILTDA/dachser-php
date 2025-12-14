-- Create accrual_entries table for accrual management
CREATE TABLE public.accrual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  shared_code TEXT,
  status_accrual TEXT NOT NULL DEFAULT 'ATIVO',
  data_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accrual_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view accrual_entries"
ON public.accrual_entries FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert accrual_entries"
ON public.accrual_entries FOR INSERT TO authenticated
WITH CHECK (auth.uid() = uploaded_by_user_id);

CREATE POLICY "Admins can manage all accrual_entries"
ON public.accrual_entries FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'::app_role));

-- Create sla_config table for SLA rules
CREATE TABLE public.sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa TEXT NOT NULL UNIQUE,
  horas_limite INTEGER NOT NULL DEFAULT 24,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sla_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view sla_config"
ON public.sla_config FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can manage sla_config"
ON public.sla_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'ADMIN'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_sla_config_updated_at
BEFORE UPDATE ON public.sla_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial SLA configs
INSERT INTO public.sla_config (etapa, horas_limite, ativo) VALUES 
  ('OPERACAO', 24, true),
  ('FISCAL', 48, true),
  ('SUPERVISOR', 24, true),
  ('FINANCEIRO', 24, true),
  ('ROBO', 4, true),
  ('AJUSTE_OPERACAO', 24, true),
  ('AJUSTE_FISCAL', 24, true);