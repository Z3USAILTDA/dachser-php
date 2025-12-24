-- Tabela de configurações CHB por cliente
CREATE TABLE public.chb_client_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_cnpj TEXT NOT NULL UNIQUE,
  cliente_nome TEXT,
  tolerancia_peso NUMERIC DEFAULT 2.0,
  tolerancia_valor NUMERIC DEFAULT 1.0,
  campos_obrigatorios JSONB DEFAULT '["peso_bruto", "peso_liquido", "valor_total", "moeda", "incoterm"]'::jsonb,
  regras_comparacao JSONB DEFAULT '{}'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.chb_client_config ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "Authenticated users can view chb_client_config"
ON public.chb_client_config
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert chb_client_config"
ON public.chb_client_config
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update chb_client_config"
ON public.chb_client_config
FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete chb_client_config"
ON public.chb_client_config
FOR DELETE
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_chb_client_config_updated_at
BEFORE UPDATE ON public.chb_client_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.chb_client_config IS 'Configurações de validação CHB por cliente';