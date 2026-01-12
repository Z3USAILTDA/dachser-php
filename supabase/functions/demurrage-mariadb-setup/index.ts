import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("=== Starting Demurrage MariaDB Setup ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let client: Client | null = null;

  try {
    const mariaConfig = {
      hostname: Deno.env.get("MARIADB_HOST") || "",
      port: parseInt(Deno.env.get("MARIADB_PORT") || "3306"),
      username: Deno.env.get("MARIADB_USER") || "",
      password: Deno.env.get("MARIADB_PASSWORD") || "",
      db: Deno.env.get("MARIADB_DATABASE") || "",
    };

    if (!mariaConfig.hostname || !mariaConfig.username) {
      throw new Error("MariaDB credentials not configured");
    }

    console.log(`Connecting to MariaDB at ${mariaConfig.hostname}:${mariaConfig.port}`);
    client = await new Client().connect(mariaConfig);
    console.log("✓ Connected to MariaDB");

    // Create main containers table
    console.log("Creating t_dachser_demurrage_containers table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_containers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        numero VARCHAR(20) NOT NULL,
        mbl VARCHAR(50) NOT NULL,
        booking VARCHAR(50) DEFAULT NULL,
        
        -- Dados do Shipment (de t_tracking_sea)
        cliente VARCHAR(255) DEFAULT NULL,
        armador VARCHAR(100) DEFAULT NULL,
        tipo_processo VARCHAR(50) DEFAULT NULL,
        porto_origem VARCHAR(100) DEFAULT NULL,
        porto_destino VARCHAR(100) DEFAULT NULL,
        navio VARCHAR(100) DEFAULT NULL,
        vessel_imo VARCHAR(20) DEFAULT NULL,
        voyage VARCHAR(30) DEFAULT NULL,
        
        -- Datas
        etd DATE DEFAULT NULL,
        eta DATE DEFAULT NULL,
        data_atracacao DATE DEFAULT NULL,
        data_gate_out DATE DEFAULT NULL,
        
        -- Status e Eventos
        last_event VARCHAR(500) DEFAULT NULL,
        container_status VARCHAR(100) DEFAULT NULL,
        status_armador VARCHAR(50) DEFAULT NULL,
        cronos_status VARCHAR(50) DEFAULT 'PENDING',
        
        -- Contatos
        email_analista VARCHAR(200) DEFAULT NULL,
        email_cliente VARCHAR(200) DEFAULT NULL,
        
        -- Demurrage (Calculado)
        tipo_conteiner VARCHAR(20) DEFAULT NULL,
        ft_started_at DATETIME DEFAULT NULL,
        free_time_days INT DEFAULT 14,
        free_time_end_date DATE DEFAULT NULL,
        data_devolucao DATE DEFAULT NULL,
        days_remaining INT DEFAULT NULL,
        excedente_dias INT DEFAULT 0,
        expected_cost_usd DECIMAL(12,2) DEFAULT 0,
        rate_usd_per_day DECIMAL(10,2) DEFAULT NULL,
        risk_status VARCHAR(20) DEFAULT 'pending',
        risk_score INT DEFAULT 0,
        
        -- Pré-Faturamento
        pre_invoice_number VARCHAR(50) DEFAULT NULL,
        pre_invoice_status VARCHAR(30) DEFAULT 'PENDENTE',
        pre_invoice_total_usd DECIMAL(12,2) DEFAULT NULL,
        
        -- Disputa
        disputed_amount_usd DECIMAL(12,2) DEFAULT 0,
        recovered_amount_usd DECIMAL(12,2) DEFAULT 0,
        dispute_status VARCHAR(30) DEFAULT NULL,
        dispute_reason TEXT DEFAULT NULL,
        
        -- Custos do Armador
        armador_invoice_number VARCHAR(50) DEFAULT NULL,
        armador_cost_usd DECIMAL(12,2) DEFAULT NULL,
        armador_days_charged INT DEFAULT NULL,
        audit_status VARCHAR(30) DEFAULT NULL,
        discrepancy_usd DECIMAL(12,2) DEFAULT NULL,
        
        -- Configuração do Cliente
        client_auto_alert TINYINT(1) DEFAULT 1,
        client_alert_days_before INT DEFAULT 3,
        client_report_frequency VARCHAR(20) DEFAULT 'weekly',
        
        -- Origem do Free Time
        ft_source VARCHAR(20) DEFAULT 'DEFAULT',
        
        -- Notas e Controle
        notes TEXT DEFAULT NULL,
        mariadb_id BIGINT DEFAULT NULL,
        last_sync_at DATETIME DEFAULT NULL,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        UNIQUE KEY unique_container_mbl (numero, mbl),
        INDEX idx_numero (numero),
        INDEX idx_mbl (mbl),
        INDEX idx_cliente (cliente),
        INDEX idx_armador (armador),
        INDEX idx_risk_status (risk_status),
        INDEX idx_cronos_status (cronos_status),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_containers table");

    // Add ft_source column if not exists (for existing tables)
    console.log("Adding ft_source column to existing tables...");
    try {
      await client.execute(`
        ALTER TABLE dados_dachser.t_dachser_demurrage_containers 
        ADD COLUMN IF NOT EXISTS ft_source VARCHAR(20) DEFAULT 'DEFAULT' AFTER risk_score
      `);
      console.log("✓ Added ft_source column (or already exists)");
    } catch (alterError) {
      console.log("Note: ft_source column may already exist");
    }

    // Fix existing records with NULL ft_started_at
    console.log("Fixing existing records with NULL ft_started_at...");
    try {
      const fixResult = await client.execute(`
        UPDATE dados_dachser.t_dachser_demurrage_containers 
        SET ft_started_at = COALESCE(data_atracacao, eta, created_at)
        WHERE ft_started_at IS NULL
      `);
      console.log(`✓ Fixed ${fixResult.affectedRows ?? 0} records with NULL ft_started_at`);
    } catch (fixError) {
      console.log("Note: Could not fix ft_started_at, may already be populated");
    }

    // Create rates table
    console.log("Creating t_dachser_demurrage_rates table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_rates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        armador VARCHAR(100) NOT NULL,
        container_type VARCHAR(20) NOT NULL,
        free_time_days INT NOT NULL DEFAULT 14,
        rate_usd DECIMAL(10,2) NOT NULL,
        period_type VARCHAR(30) DEFAULT 'standard',
        period_start_day INT DEFAULT NULL,
        period_end_day INT DEFAULT NULL,
        active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_rate (armador, container_type, period_type, period_start_day)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_rates table");

    // Create settings table
    console.log("Creating t_dachser_demurrage_settings table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL,
        setting_value TEXT NOT NULL,
        description TEXT DEFAULT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_settings table");

    // Insert default settings
    console.log("Inserting default settings...");
    await client.execute(`
      INSERT IGNORE INTO dados_dachser.t_dachser_demurrage_settings (setting_key, setting_value, description)
      VALUES 
        ('default_free_time', '14', 'Default free time in days'),
        ('default_rate', '150', 'Default demurrage rate per day in USD'),
        ('alert_days_before', '3', 'Days before free time end to send alerts'),
        ('auto_sync_enabled', 'true', 'Enable automatic sync from t_tracking_sea')
    `);
    console.log("✓ Inserted default settings");

    // Create client profiles table
    console.log("Creating t_dachser_demurrage_client_profiles table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_client_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente VARCHAR(255) NOT NULL,
        auto_alert_enabled TINYINT(1) DEFAULT 1,
        alert_days_before INT DEFAULT 3,
        report_frequency VARCHAR(30) DEFAULT 'WEEKLY',
        contact_emails JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_cliente (cliente),
        INDEX idx_cliente (cliente),
        INDEX idx_auto_alert (auto_alert_enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_client_profiles table");

    // Insert some sample rates for common armadores
    console.log("Inserting sample demurrage rates...");
    await client.execute(`
      INSERT IGNORE INTO dados_dachser.t_dachser_demurrage_rates 
        (armador, container_type, free_time_days, rate_usd, period_type, period_start_day, period_end_day)
      VALUES 
        ('MSC', '20DV', 14, 100.00, 'period_1', 1, 7),
        ('MSC', '20DV', 14, 150.00, 'period_2', 8, 15),
        ('MSC', '20DV', 14, 200.00, 'period_3', 16, NULL),
        ('MSC', '40DV', 14, 150.00, 'period_1', 1, 7),
        ('MSC', '40DV', 14, 225.00, 'period_2', 8, 15),
        ('MSC', '40DV', 14, 300.00, 'period_3', 16, NULL),
        ('MSC', '40HC', 14, 150.00, 'period_1', 1, 7),
        ('MSC', '40HC', 14, 225.00, 'period_2', 8, 15),
        ('MSC', '40HC', 14, 300.00, 'period_3', 16, NULL),
        ('HAPAG-LLOYD', '20DV', 14, 95.00, 'period_1', 1, 7),
        ('HAPAG-LLOYD', '20DV', 14, 140.00, 'period_2', 8, 14),
        ('HAPAG-LLOYD', '20DV', 14, 190.00, 'period_3', 15, NULL),
        ('HAPAG-LLOYD', '40DV', 14, 140.00, 'period_1', 1, 7),
        ('HAPAG-LLOYD', '40DV', 14, 210.00, 'period_2', 8, 14),
        ('HAPAG-LLOYD', '40DV', 14, 280.00, 'period_3', 15, NULL),
        ('MAERSK', '20DV', 10, 110.00, 'period_1', 1, 5),
        ('MAERSK', '20DV', 10, 165.00, 'period_2', 6, 10),
        ('MAERSK', '20DV', 10, 220.00, 'period_3', 11, NULL),
        ('MAERSK', '40DV', 10, 165.00, 'period_1', 1, 5),
        ('MAERSK', '40DV', 10, 245.00, 'period_2', 6, 10),
        ('MAERSK', '40DV', 10, 330.00, 'period_3', 11, NULL),
        ('DEFAULT', '20DV', 14, 100.00, 'standard', NULL, NULL),
        ('DEFAULT', '40DV', 14, 150.00, 'standard', NULL, NULL),
        ('DEFAULT', '40HC', 14, 150.00, 'standard', NULL, NULL)
    `);
    console.log("✓ Inserted sample demurrage rates");

    // Create pre-invoices table
    console.log("Creating t_dachser_demurrage_pre_invoices table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_pre_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        shipment_mbl VARCHAR(100) DEFAULT NULL,
        client_name VARCHAR(255) DEFAULT NULL,
        bl_number VARCHAR(100) DEFAULT NULL,
        vessel_name VARCHAR(150) DEFAULT NULL,
        voyage_number VARCHAR(50) DEFAULT NULL,
        origin_port VARCHAR(100) DEFAULT NULL,
        destination_port VARCHAR(100) DEFAULT NULL,
        arrival_date DATE DEFAULT NULL,
        issue_date DATE DEFAULT NULL,
        due_date DATE DEFAULT NULL,
        total_usd DECIMAL(12,2) DEFAULT 0,
        total_brl DECIMAL(12,2) DEFAULT 0,
        exchange_rate DECIMAL(10,4) DEFAULT 6.16,
        status VARCHAR(30) DEFAULT 'pending',
        workflow_status VARCHAR(30) DEFAULT 'calculated',
        financial_status VARCHAR(30) DEFAULT 'PENDING',
        notes TEXT DEFAULT NULL,
        posted_at DATETIME DEFAULT NULL,
        created_by VARCHAR(100) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_client_name (client_name),
        INDEX idx_status (status),
        INDEX idx_workflow_status (workflow_status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_pre_invoices table");

    // Create pre-invoice items table
    console.log("Creating t_dachser_demurrage_pre_invoice_items table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_pre_invoice_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pre_invoice_id INT NOT NULL,
        container_id INT NOT NULL,
        container_number VARCHAR(20) DEFAULT NULL,
        container_type VARCHAR(20) DEFAULT NULL,
        free_time_days INT DEFAULT 14,
        period_start_date DATE DEFAULT NULL,
        period_end_date DATE DEFAULT NULL,
        days_count INT DEFAULT 0,
        daily_rate_usd DECIMAL(10,2) DEFAULT NULL,
        total_usd DECIMAL(12,2) DEFAULT 0,
        period_type VARCHAR(30) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pre_invoice (pre_invoice_id),
        INDEX idx_container (container_id),
        INDEX idx_container_number (container_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_pre_invoice_items table");

    // Create container events table (timeline from API)
    console.log("Creating t_dachser_demurrage_container_events table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_container_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_id INT NOT NULL,
        container_number VARCHAR(20) DEFAULT NULL,
        event_type VARCHAR(50) DEFAULT NULL,
        event_code VARCHAR(30) DEFAULT NULL,
        event_description TEXT DEFAULT NULL,
        event_datetime DATETIME DEFAULT NULL,
        location VARCHAR(255) DEFAULT NULL,
        vessel_name VARCHAR(150) DEFAULT NULL,
        voyage_number VARCHAR(50) DEFAULT NULL,
        terminal VARCHAR(150) DEFAULT NULL,
        source VARCHAR(30) DEFAULT 'JSONCARGO',
        raw_data JSON DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_container (container_id),
        INDEX idx_container_number (container_number),
        INDEX idx_event_datetime (event_datetime),
        INDEX idx_event_type (event_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_container_events table");

    // Create alerts table
    console.log("Creating t_dachser_demurrage_alerts table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_id INT NOT NULL,
        container_number VARCHAR(20) DEFAULT NULL,
        alert_type VARCHAR(30) DEFAULT NULL,
        client_name VARCHAR(255) DEFAULT NULL,
        shipment_master VARCHAR(100) DEFAULT NULL,
        days_remaining INT DEFAULT NULL,
        expected_cost_usd DECIMAL(12,2) DEFAULT NULL,
        recipient_emails JSON DEFAULT NULL,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(20) DEFAULT 'sent',
        error_message TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_container (container_id),
        INDEX idx_container_number (container_number),
        INDEX idx_sent_at (sent_at),
        INDEX idx_status (status),
        INDEX idx_alert_type (alert_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_alerts table");

    // Create disputes table
    console.log("Creating t_dachser_demurrage_disputes table...");
    await client.execute(`
      CREATE TABLE IF NOT EXISTS dados_dachser.t_dachser_demurrage_disputes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        container_id INT NOT NULL,
        container_number VARCHAR(20) DEFAULT NULL,
        client_name VARCHAR(255) DEFAULT NULL,
        armador VARCHAR(100) DEFAULT NULL,
        status VARCHAR(30) DEFAULT 'opened',
        disputed_amount_usd DECIMAL(12,2) DEFAULT 0,
        recovered_amount_usd DECIMAL(12,2) DEFAULT 0,
        reason TEXT DEFAULT NULL,
        success_probability INT DEFAULT 50,
        resolution_notes TEXT DEFAULT NULL,
        opened_by VARCHAR(100) DEFAULT NULL,
        resolved_by VARCHAR(100) DEFAULT NULL,
        opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_container (container_id),
        INDEX idx_container_number (container_number),
        INDEX idx_status (status),
        INDEX idx_client_name (client_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✓ Created t_dachser_demurrage_disputes table");

    await client.close();
    console.log("✓ MariaDB connection closed");

    console.log("=== Demurrage MariaDB Setup Complete ===");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demurrage tables created successfully in MariaDB",
        tables: [
          "t_dachser_demurrage_containers",
          "t_dachser_demurrage_rates",
          "t_dachser_demurrage_settings",
          "t_dachser_demurrage_client_profiles",
          "t_dachser_demurrage_pre_invoices",
          "t_dachser_demurrage_pre_invoice_items",
          "t_dachser_demurrage_container_events",
          "t_dachser_demurrage_alerts",
          "t_dachser_demurrage_disputes"
        ],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Setup error:", error);
    if (client) {
      try { await client.close(); } catch {}
    }
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
