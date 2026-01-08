-- =============================================
-- FASE 1: Criar Tabela Principal t_demurrage_containers
-- =============================================
CREATE TABLE t_demurrage_containers (
  -- Identificação
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero VARCHAR(20) NOT NULL,
  mbl VARCHAR(50) NOT NULL,
  booking VARCHAR(50),
  
  -- Dados do Shipment (MariaDB t_tracking_sea)
  cliente VARCHAR(255),
  armador VARCHAR(100),
  tipo_processo VARCHAR(50),
  porto_origem VARCHAR(100),
  porto_destino VARCHAR(100),
  navio VARCHAR(100),
  vessel_imo VARCHAR(20),
  voyage VARCHAR(30),
  
  -- Datas
  etd DATE,
  eta DATE,
  data_atracacao DATE,
  
  -- Status e Eventos (MariaDB)
  last_event VARCHAR(500),
  container_status VARCHAR(100),
  status_armador VARCHAR(50),
  cronos_status VARCHAR(50) DEFAULT 'PENDING',
  
  -- Contatos
  email_analista VARCHAR(200),
  email_cliente VARCHAR(200),
  
  -- Demurrage (Calculado)
  tipo_conteiner VARCHAR(20),
  ft_started_at TIMESTAMPTZ,
  free_time_days INTEGER DEFAULT 14,
  free_time_end_date DATE,
  data_devolucao DATE,
  days_remaining INTEGER,
  excedente_dias INTEGER DEFAULT 0,
  expected_cost_usd NUMERIC(12,2) DEFAULT 0,
  rate_usd_per_day NUMERIC(10,2),
  risk_status VARCHAR(20) DEFAULT 'pending',
  risk_score INTEGER DEFAULT 0,
  
  -- Pré-Faturamento
  pre_invoice_number VARCHAR(50),
  pre_invoice_status VARCHAR(30) DEFAULT 'PENDENTE',
  pre_invoice_total_usd NUMERIC(12,2),
  
  -- Disputa
  disputed_amount_usd NUMERIC(12,2) DEFAULT 0,
  recovered_amount_usd NUMERIC(12,2) DEFAULT 0,
  dispute_status VARCHAR(30),
  dispute_reason TEXT,
  
  -- Custos do Armador (Auditoria)
  armador_invoice_number VARCHAR(50),
  armador_cost_usd NUMERIC(12,2),
  armador_days_charged INTEGER,
  audit_status VARCHAR(30),
  discrepancy_usd NUMERIC(12,2),
  
  -- Configuração do Cliente
  client_auto_alert BOOLEAN DEFAULT true,
  client_alert_days_before INTEGER DEFAULT 3,
  client_report_frequency VARCHAR(20) DEFAULT 'weekly',
  
  -- Notas e Controle
  notes TEXT,
  mariadb_id BIGINT,
  last_sync_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(numero, mbl)
);

-- Índices para performance
CREATE INDEX idx_t_demurrage_containers_numero ON t_demurrage_containers(numero);
CREATE INDEX idx_t_demurrage_containers_mbl ON t_demurrage_containers(mbl);
CREATE INDEX idx_t_demurrage_containers_cliente ON t_demurrage_containers(cliente);
CREATE INDEX idx_t_demurrage_containers_armador ON t_demurrage_containers(armador);
CREATE INDEX idx_t_demurrage_containers_risk ON t_demurrage_containers(risk_status);
CREATE INDEX idx_t_demurrage_containers_cronos ON t_demurrage_containers(cronos_status);

-- =============================================
-- FASE 2: Criar Tabela t_demurrage_rates
-- =============================================
CREATE TABLE t_demurrage_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  armador VARCHAR(100) NOT NULL,
  container_type VARCHAR(20) NOT NULL,
  free_time_days INTEGER NOT NULL DEFAULT 14,
  rate_usd NUMERIC(10,2) NOT NULL,
  period_type VARCHAR(30) DEFAULT 'standard',
  period_start_day INTEGER,
  period_end_day INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(armador, container_type, period_type)
);

-- =============================================
-- FASE 3: Criar Tabela t_demurrage_settings
-- =============================================
CREATE TABLE t_demurrage_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir configurações padrão
INSERT INTO t_demurrage_settings (key, value, description) VALUES
  ('default_free_time', '14', 'Dias de free time padrão'),
  ('default_rate', '150', 'Taxa diária padrão (USD)'),
  ('alert_days_before', '3', 'Dias antes do vencimento para alerta');

-- =============================================
-- FASE 4: Configurar RLS
-- =============================================

-- RLS para t_demurrage_containers
ALTER TABLE t_demurrage_containers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_t_demurrage_containers" 
  ON t_demurrage_containers FOR SELECT USING (true);

CREATE POLICY "insert_t_demurrage_containers" 
  ON t_demurrage_containers FOR INSERT WITH CHECK (true);

CREATE POLICY "update_t_demurrage_containers" 
  ON t_demurrage_containers FOR UPDATE USING (true);

CREATE POLICY "delete_t_demurrage_containers" 
  ON t_demurrage_containers FOR DELETE 
  USING (has_role(auth.uid(), 'ADMIN'));

-- RLS para t_demurrage_rates
ALTER TABLE t_demurrage_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_t_demurrage_rates" 
  ON t_demurrage_rates FOR SELECT USING (true);

CREATE POLICY "insert_t_demurrage_rates" 
  ON t_demurrage_rates FOR INSERT WITH CHECK (true);

CREATE POLICY "update_t_demurrage_rates" 
  ON t_demurrage_rates FOR UPDATE USING (true);

CREATE POLICY "delete_t_demurrage_rates" 
  ON t_demurrage_rates FOR DELETE USING (true);

-- RLS para t_demurrage_settings
ALTER TABLE t_demurrage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_t_demurrage_settings" 
  ON t_demurrage_settings FOR SELECT USING (true);

CREATE POLICY "admin_manage_t_demurrage_settings" 
  ON t_demurrage_settings FOR ALL 
  USING (has_role(auth.uid(), 'ADMIN'));

-- =============================================
-- FASE 5: Habilitar Realtime
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE t_demurrage_containers;

-- =============================================
-- Trigger para updated_at
-- =============================================
CREATE TRIGGER update_t_demurrage_containers_updated_at
  BEFORE UPDATE ON t_demurrage_containers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_t_demurrage_rates_updated_at
  BEFORE UPDATE ON t_demurrage_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();