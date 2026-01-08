-- Criar tabela para configurações de Free Time por cliente
CREATE TABLE t_client_free_time (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_cnpj VARCHAR(20),
  cliente_nome VARCHAR(255) NOT NULL,
  tipo_ft VARCHAR(20) NOT NULL DEFAULT 'CONTRATO', -- 'CONTRATO' ou 'PROCESSO'
  vigencia_inicio DATE,
  vigencia_fim DATE,
  mbl VARCHAR(50),
  free_time_days INTEGER NOT NULL DEFAULT 14,
  armador VARCHAR(50),
  notas TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Habilitar RLS
ALTER TABLE t_client_free_time ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "select_t_client_free_time" ON t_client_free_time
  FOR SELECT USING (true);

CREATE POLICY "insert_t_client_free_time" ON t_client_free_time
  FOR INSERT WITH CHECK (true);

CREATE POLICY "update_t_client_free_time" ON t_client_free_time
  FOR UPDATE USING (true);

CREATE POLICY "delete_t_client_free_time" ON t_client_free_time
  FOR DELETE USING (true);

-- Adicionar campos na tabela de containers para rastrear origem do FT
ALTER TABLE t_demurrage_containers 
ADD COLUMN IF NOT EXISTS ft_pendente BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ft_origem VARCHAR(20);