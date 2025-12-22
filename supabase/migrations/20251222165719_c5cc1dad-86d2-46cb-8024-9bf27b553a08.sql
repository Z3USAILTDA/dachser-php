-- Adicionar coluna origem_criacao para identificar se voucher foi criado manualmente ou via RM
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS origem_criacao TEXT DEFAULT 'MANUAL';

-- Criar índice para melhor performance nas consultas com filtro
CREATE INDEX IF NOT EXISTS idx_vouchers_origem_criacao ON public.vouchers(origem_criacao);