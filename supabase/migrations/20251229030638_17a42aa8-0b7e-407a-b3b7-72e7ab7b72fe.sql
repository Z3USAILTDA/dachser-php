-- Adicionar campos de armador, agente e tolerâncias de taxas acessórias
ALTER TABLE public.chb_client_config 
ADD COLUMN IF NOT EXISTS armador text,
ADD COLUMN IF NOT EXISTS agente_destino text,
ADD COLUMN IF NOT EXISTS contato_email text,
ADD COLUMN IF NOT EXISTS prazo_resposta_dias integer DEFAULT 2,
ADD COLUMN IF NOT EXISTS porto_descarga_real text,
ADD COLUMN IF NOT EXISTS tolerancia_taxas_acessorias_abs numeric DEFAULT 50,
ADD COLUMN IF NOT EXISTS tolerancia_taxas_acessorias_pct numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS beneficio_fiscal text,
ADD COLUMN IF NOT EXISTS cfop_padrao text,
ADD COLUMN IF NOT EXISTS estado_uf text,
ADD COLUMN IF NOT EXISTS icms_diferido boolean DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN public.chb_client_config.armador IS 'Armador/Shipping Line padrão (ex: MSC Mediterranean Shipping Company S.A.)';
COMMENT ON COLUMN public.chb_client_config.agente_destino IS 'Agente de destino padrão (ex: MSC do Brasil – Santos)';
COMMENT ON COLUMN public.chb_client_config.contato_email IS 'E-mail de contato para divergências com armador';
COMMENT ON COLUMN public.chb_client_config.prazo_resposta_dias IS 'Prazo para resposta do armador em dias (padrão: 2)';
COMMENT ON COLUMN public.chb_client_config.porto_descarga_real IS 'Porto de descarregamento real (se diferente do declarado)';
COMMENT ON COLUMN public.chb_client_config.tolerancia_taxas_acessorias_abs IS 'Tolerância absoluta para taxas acessórias em USD/EUR (padrão: 50)';
COMMENT ON COLUMN public.chb_client_config.tolerancia_taxas_acessorias_pct IS 'Tolerância percentual para taxas acessórias (padrão: 1%)';
COMMENT ON COLUMN public.chb_client_config.beneficio_fiscal IS 'Benefício fiscal aplicável: RECOF, DRAWBACK, EX_TARIFARIO ou null';
COMMENT ON COLUMN public.chb_client_config.cfop_padrao IS 'CFOP padrão para operações deste cliente';
COMMENT ON COLUMN public.chb_client_config.estado_uf IS 'UF do cliente para regras de ICMS';
COMMENT ON COLUMN public.chb_client_config.icms_diferido IS 'Se ICMS é diferido neste estado';