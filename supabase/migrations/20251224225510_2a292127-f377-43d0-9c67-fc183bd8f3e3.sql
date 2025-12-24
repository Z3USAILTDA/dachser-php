-- Add custom instructions column for client-specific analysis parameters
ALTER TABLE public.chb_client_config 
ADD COLUMN instrucoes_personalizadas TEXT DEFAULT NULL;

COMMENT ON COLUMN public.chb_client_config.instrucoes_personalizadas IS 'Texto livre com instruções personalizadas para análise do cliente';