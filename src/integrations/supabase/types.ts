export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accrual_entries: {
        Row: {
          created_at: string
          data_upload: string
          fornecedor: string
          id: string
          shared_code: string | null
          status_accrual: string
          uploaded_by_user_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          data_upload?: string
          fornecedor: string
          id?: string
          shared_code?: string | null
          status_accrual?: string
          uploaded_by_user_id?: string | null
          valor: number
        }
        Update: {
          created_at?: string
          data_upload?: string
          fornecedor?: string
          id?: string
          shared_code?: string | null
          status_accrual?: string
          uploaded_by_user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      api_usage_cycles: {
        Row: {
          api_name: string
          created_at: string
          cycle_end_date: string
          cycle_start_date: string
          estimated_cost_usd: number | null
          id: string
          monthly_limit: number | null
          plan_name: string | null
          total_calls: number
          total_errors: number
          updated_at: string
          usage_percentage: number | null
        }
        Insert: {
          api_name: string
          created_at?: string
          cycle_end_date: string
          cycle_start_date: string
          estimated_cost_usd?: number | null
          id?: string
          monthly_limit?: number | null
          plan_name?: string | null
          total_calls?: number
          total_errors?: number
          updated_at?: string
          usage_percentage?: number | null
        }
        Update: {
          api_name?: string
          created_at?: string
          cycle_end_date?: string
          cycle_start_date?: string
          estimated_cost_usd?: number | null
          id?: string
          monthly_limit?: number | null
          plan_name?: string | null
          total_calls?: number
          total_errors?: number
          updated_at?: string
          usage_percentage?: number | null
        }
        Relationships: []
      }
      cct_evento_normalizado: {
        Row: {
          aeroporto: string | null
          codigo_evento: string
          created_at: string
          data_hora_evento: string
          descricao_evento: string | null
          detalhes_raw: Json | null
          fonte: string | null
          id: string
          nivel_confianca: string | null
          shipment_id: string
        }
        Insert: {
          aeroporto?: string | null
          codigo_evento: string
          created_at?: string
          data_hora_evento?: string
          descricao_evento?: string | null
          detalhes_raw?: Json | null
          fonte?: string | null
          id?: string
          nivel_confianca?: string | null
          shipment_id: string
        }
        Update: {
          aeroporto?: string | null
          codigo_evento?: string
          created_at?: string
          data_hora_evento?: string
          descricao_evento?: string | null
          detalhes_raw?: Json | null
          fonte?: string | null
          id?: string
          nivel_confianca?: string | null
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cct_evento_normalizado_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      cct_excecao_operacional: {
        Row: {
          created_at: string
          descricao: string
          fonte_detectou: string | null
          id: string
          resolvido_em: string | null
          shipment_id: string
          status_excecao: string
          tipo_excecao: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao: string
          fonte_detectou?: string | null
          id?: string
          resolvido_em?: string | null
          shipment_id: string
          status_excecao?: string
          tipo_excecao: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string
          fonte_detectou?: string | null
          id?: string
          resolvido_em?: string | null
          shipment_id?: string
          status_excecao?: string
          tipo_excecao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cct_excecao_operacional_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      cct_status_atual: {
        Row: {
          created_at: string
          id: string
          shipment_id: string
          sla_limite: string | null
          sla_status: string
          status_cct_oficial: string
          status_handler: string | null
          tipo_voo: string | null
          ultima_atualizacao: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          shipment_id: string
          sla_limite?: string | null
          sla_status?: string
          status_cct_oficial?: string
          status_handler?: string | null
          tipo_voo?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          shipment_id?: string
          sla_limite?: string | null
          sla_status?: string
          status_cct_oficial?: string
          status_handler?: string | null
          tipo_voo?: string | null
          ultima_atualizacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cct_status_atual_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: true
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      chb_analysis_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          item_id: number
          request_payload: Json | null
          result_html: string | null
          status: string
          step_id: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          item_id: number
          request_payload?: Json | null
          result_html?: string | null
          status?: string
          step_id: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          item_id?: number
          request_payload?: Json | null
          result_html?: string | null
          status?: string
          step_id?: number
        }
        Relationships: []
      }
      chb_client_config: {
        Row: {
          agente_destino: string | null
          armador: string | null
          ativo: boolean | null
          beneficio_fiscal: string | null
          campos_obrigatorios: Json | null
          cfop_padrao: string | null
          cliente_cnpj: string
          cliente_nome: string | null
          contato_email: string | null
          created_at: string
          estado_uf: string | null
          icms_diferido: boolean | null
          id: string
          instrucoes_personalizadas: string | null
          porto_descarga_real: string | null
          prazo_resposta_dias: number | null
          regras_comparacao: Json | null
          tolerancia_peso: number | null
          tolerancia_taxas_acessorias_abs: number | null
          tolerancia_taxas_acessorias_pct: number | null
          tolerancia_valor: number | null
          updated_at: string
        }
        Insert: {
          agente_destino?: string | null
          armador?: string | null
          ativo?: boolean | null
          beneficio_fiscal?: string | null
          campos_obrigatorios?: Json | null
          cfop_padrao?: string | null
          cliente_cnpj: string
          cliente_nome?: string | null
          contato_email?: string | null
          created_at?: string
          estado_uf?: string | null
          icms_diferido?: boolean | null
          id?: string
          instrucoes_personalizadas?: string | null
          porto_descarga_real?: string | null
          prazo_resposta_dias?: number | null
          regras_comparacao?: Json | null
          tolerancia_peso?: number | null
          tolerancia_taxas_acessorias_abs?: number | null
          tolerancia_taxas_acessorias_pct?: number | null
          tolerancia_valor?: number | null
          updated_at?: string
        }
        Update: {
          agente_destino?: string | null
          armador?: string | null
          ativo?: boolean | null
          beneficio_fiscal?: string | null
          campos_obrigatorios?: Json | null
          cfop_padrao?: string | null
          cliente_cnpj?: string
          cliente_nome?: string | null
          contato_email?: string | null
          created_at?: string
          estado_uf?: string | null
          icms_diferido?: boolean | null
          id?: string
          instrucoes_personalizadas?: string | null
          porto_descarga_real?: string | null
          prazo_resposta_dias?: number | null
          regras_comparacao?: Json | null
          tolerancia_peso?: number | null
          tolerancia_taxas_acessorias_abs?: number | null
          tolerancia_taxas_acessorias_pct?: number | null
          tolerancia_valor?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      chb_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_role: string | null
          etapa: string
          file_size: number | null
          file_url: string
          filename: string
          id: string
          item_id: number
          mime_type: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_role?: string | null
          etapa?: string
          file_size?: number | null
          file_url: string
          filename: string
          id?: string
          item_id: number
          mime_type?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_role?: string | null
          etapa?: string
          file_size?: number | null
          file_url?: string
          filename?: string
          id?: string
          item_id?: number
          mime_type?: string | null
        }
        Relationships: []
      }
      chb_extracted_data: {
        Row: {
          created_at: string
          document_id: string | null
          etapa: string
          extracted_fields: Json
          filename: string
          id: string
          item_id: number
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          etapa: string
          extracted_fields?: Json
          filename: string
          id?: string
          item_id: number
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          etapa?: string
          extracted_fields?: Json
          filename?: string
          id?: string
          item_id?: number
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chb_extracted_data_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "chb_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shipments: {
        Row: {
          aeroporto_destino: string
          aeroporto_origem: string
          cliente: string
          cnpj_consignatario: string | null
          created_at: string
          data_decolagem_ultimo_trecho: string | null
          data_finalizacao: string | null
          data_manifestacao_cct: string | null
          email_analista: string | null
          emails_cliente: string | null
          eta: string | null
          etd: string | null
          excecoes_abertas: number
          house: string
          id: string
          master: string
          nome_analista: string | null
          peso_constatado: number | null
          peso_declarado: number | null
          sla_limite: string | null
          sla_status: string | null
          status_cct_oficial: string | null
          status_manifestacao: string | null
          tipo_voo: string | null
          tratamentos_especiais: string | null
          ultimo_evento_codigo: string | null
          ultimo_evento_data: string | null
          ultimo_evento_descricao: string | null
          updated_at: string
          volume_constatado: number | null
          volume_declarado: number | null
        }
        Insert: {
          aeroporto_destino: string
          aeroporto_origem: string
          cliente: string
          cnpj_consignatario?: string | null
          created_at?: string
          data_decolagem_ultimo_trecho?: string | null
          data_finalizacao?: string | null
          data_manifestacao_cct?: string | null
          email_analista?: string | null
          emails_cliente?: string | null
          eta?: string | null
          etd?: string | null
          excecoes_abertas?: number
          house: string
          id?: string
          master: string
          nome_analista?: string | null
          peso_constatado?: number | null
          peso_declarado?: number | null
          sla_limite?: string | null
          sla_status?: string | null
          status_cct_oficial?: string | null
          status_manifestacao?: string | null
          tipo_voo?: string | null
          tratamentos_especiais?: string | null
          ultimo_evento_codigo?: string | null
          ultimo_evento_data?: string | null
          ultimo_evento_descricao?: string | null
          updated_at?: string
          volume_constatado?: number | null
          volume_declarado?: number | null
        }
        Update: {
          aeroporto_destino?: string
          aeroporto_origem?: string
          cliente?: string
          cnpj_consignatario?: string | null
          created_at?: string
          data_decolagem_ultimo_trecho?: string | null
          data_finalizacao?: string | null
          data_manifestacao_cct?: string | null
          email_analista?: string | null
          emails_cliente?: string | null
          eta?: string | null
          etd?: string | null
          excecoes_abertas?: number
          house?: string
          id?: string
          master?: string
          nome_analista?: string | null
          peso_constatado?: number | null
          peso_declarado?: number | null
          sla_limite?: string | null
          sla_status?: string | null
          status_cct_oficial?: string | null
          status_manifestacao?: string | null
          tipo_voo?: string | null
          tratamentos_especiais?: string | null
          ultimo_evento_codigo?: string | null
          ultimo_evento_data?: string | null
          ultimo_evento_descricao?: string | null
          updated_at?: string
          volume_constatado?: number | null
          volume_declarado?: number | null
        }
        Relationships: []
      }
      sla_config: {
        Row: {
          ativo: boolean
          created_at: string
          etapa: string
          horas_limite: number
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          etapa: string
          horas_limite?: number
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          etapa?: string
          horas_limite?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      t_demurrage_containers: {
        Row: {
          active: boolean | null
          armador: string | null
          armador_cost_usd: number | null
          armador_days_charged: number | null
          armador_invoice_number: string | null
          audit_status: string | null
          booking: string | null
          client_alert_days_before: number | null
          client_auto_alert: boolean | null
          client_report_frequency: string | null
          cliente: string | null
          container_status: string | null
          created_at: string | null
          cronos_status: string | null
          data_atracacao: string | null
          data_devolucao: string | null
          days_remaining: number | null
          discrepancy_usd: number | null
          dispute_reason: string | null
          dispute_status: string | null
          disputed_amount_usd: number | null
          email_analista: string | null
          email_cliente: string | null
          eta: string | null
          etd: string | null
          excedente_dias: number | null
          expected_cost_usd: number | null
          free_time_days: number | null
          free_time_end_date: string | null
          ft_started_at: string | null
          id: string
          last_event: string | null
          last_sync_at: string | null
          mariadb_id: number | null
          mbl: string
          navio: string | null
          notes: string | null
          numero: string
          porto_destino: string | null
          porto_origem: string | null
          pre_invoice_number: string | null
          pre_invoice_status: string | null
          pre_invoice_total_usd: number | null
          rate_usd_per_day: number | null
          recovered_amount_usd: number | null
          risk_score: number | null
          risk_status: string | null
          status_armador: string | null
          tipo_conteiner: string | null
          tipo_processo: string | null
          updated_at: string | null
          vessel_imo: string | null
          voyage: string | null
        }
        Insert: {
          active?: boolean | null
          armador?: string | null
          armador_cost_usd?: number | null
          armador_days_charged?: number | null
          armador_invoice_number?: string | null
          audit_status?: string | null
          booking?: string | null
          client_alert_days_before?: number | null
          client_auto_alert?: boolean | null
          client_report_frequency?: string | null
          cliente?: string | null
          container_status?: string | null
          created_at?: string | null
          cronos_status?: string | null
          data_atracacao?: string | null
          data_devolucao?: string | null
          days_remaining?: number | null
          discrepancy_usd?: number | null
          dispute_reason?: string | null
          dispute_status?: string | null
          disputed_amount_usd?: number | null
          email_analista?: string | null
          email_cliente?: string | null
          eta?: string | null
          etd?: string | null
          excedente_dias?: number | null
          expected_cost_usd?: number | null
          free_time_days?: number | null
          free_time_end_date?: string | null
          ft_started_at?: string | null
          id?: string
          last_event?: string | null
          last_sync_at?: string | null
          mariadb_id?: number | null
          mbl: string
          navio?: string | null
          notes?: string | null
          numero: string
          porto_destino?: string | null
          porto_origem?: string | null
          pre_invoice_number?: string | null
          pre_invoice_status?: string | null
          pre_invoice_total_usd?: number | null
          rate_usd_per_day?: number | null
          recovered_amount_usd?: number | null
          risk_score?: number | null
          risk_status?: string | null
          status_armador?: string | null
          tipo_conteiner?: string | null
          tipo_processo?: string | null
          updated_at?: string | null
          vessel_imo?: string | null
          voyage?: string | null
        }
        Update: {
          active?: boolean | null
          armador?: string | null
          armador_cost_usd?: number | null
          armador_days_charged?: number | null
          armador_invoice_number?: string | null
          audit_status?: string | null
          booking?: string | null
          client_alert_days_before?: number | null
          client_auto_alert?: boolean | null
          client_report_frequency?: string | null
          cliente?: string | null
          container_status?: string | null
          created_at?: string | null
          cronos_status?: string | null
          data_atracacao?: string | null
          data_devolucao?: string | null
          days_remaining?: number | null
          discrepancy_usd?: number | null
          dispute_reason?: string | null
          dispute_status?: string | null
          disputed_amount_usd?: number | null
          email_analista?: string | null
          email_cliente?: string | null
          eta?: string | null
          etd?: string | null
          excedente_dias?: number | null
          expected_cost_usd?: number | null
          free_time_days?: number | null
          free_time_end_date?: string | null
          ft_started_at?: string | null
          id?: string
          last_event?: string | null
          last_sync_at?: string | null
          mariadb_id?: number | null
          mbl?: string
          navio?: string | null
          notes?: string | null
          numero?: string
          porto_destino?: string | null
          porto_origem?: string | null
          pre_invoice_number?: string | null
          pre_invoice_status?: string | null
          pre_invoice_total_usd?: number | null
          rate_usd_per_day?: number | null
          recovered_amount_usd?: number | null
          risk_score?: number | null
          risk_status?: string | null
          status_armador?: string | null
          tipo_conteiner?: string | null
          tipo_processo?: string | null
          updated_at?: string | null
          vessel_imo?: string | null
          voyage?: string | null
        }
        Relationships: []
      }
      t_demurrage_rates: {
        Row: {
          active: boolean | null
          armador: string
          container_type: string
          created_at: string | null
          free_time_days: number
          id: string
          period_end_day: number | null
          period_start_day: number | null
          period_type: string | null
          rate_usd: number
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          armador: string
          container_type: string
          created_at?: string | null
          free_time_days?: number
          id?: string
          period_end_day?: number | null
          period_start_day?: number | null
          period_type?: string | null
          rate_usd: number
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          armador?: string
          container_type?: string
          created_at?: string | null
          free_time_days?: number
          id?: string
          period_end_day?: number | null
          period_start_day?: number | null
          period_type?: string | null
          rate_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      t_demurrage_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voucher_anexos: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          tipo: string
          uploaded_by_user_id: string | null
          voucher_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          tipo: string
          uploaded_by_user_id?: string | null
          voucher_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          tipo?: string
          uploaded_by_user_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_anexos_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_logs: {
        Row: {
          acao: string
          data_hora: string
          detalhe: string | null
          id: string
          user_id: string | null
          voucher_id: string
        }
        Insert: {
          acao: string
          data_hora?: string
          detalhe?: string | null
          id?: string
          user_id?: string | null
          voucher_id: string
        }
        Update: {
          acao?: string
          data_hora?: string
          detalhe?: string | null
          id?: string
          user_id?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_logs_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          ajuste_fiscal: string | null
          ajuste_operacao: string | null
          aprovado_por_user_id: string | null
          cliente_email: string | null
          cnpj_fornecedor: string | null
          cobranca_em_nome_de: string
          comentarios_financeiro: string | null
          comentarios_fiscal: string | null
          comentarios_operacao: string | null
          created_at: string
          criado_por_user_id: string | null
          data_emissao_documento: string | null
          etapa_atual: string
          filial: string | null
          forma_pagamento: string
          fornecedor: string | null
          id: string
          moeda: string | null
          numero_spo: string
          origem_criacao: string | null
          remessa: string | null
          responsavel_financeiro_user_id: string | null
          responsavel_fiscal_user_id: string | null
          responsavel_operacao_user_id: string | null
          responsavel_supervisor_user_id: string | null
          status_baixa: string | null
          status_envio_cliente: string | null
          status_financeiro: string | null
          tipo_documento: string | null
          updated_at: string
          urgencia_tipo: string | null
          valor: number | null
          vencimento: string
        }
        Insert: {
          ajuste_fiscal?: string | null
          ajuste_operacao?: string | null
          aprovado_por_user_id?: string | null
          cliente_email?: string | null
          cnpj_fornecedor?: string | null
          cobranca_em_nome_de?: string
          comentarios_financeiro?: string | null
          comentarios_fiscal?: string | null
          comentarios_operacao?: string | null
          created_at?: string
          criado_por_user_id?: string | null
          data_emissao_documento?: string | null
          etapa_atual?: string
          filial?: string | null
          forma_pagamento?: string
          fornecedor?: string | null
          id?: string
          moeda?: string | null
          numero_spo: string
          origem_criacao?: string | null
          remessa?: string | null
          responsavel_financeiro_user_id?: string | null
          responsavel_fiscal_user_id?: string | null
          responsavel_operacao_user_id?: string | null
          responsavel_supervisor_user_id?: string | null
          status_baixa?: string | null
          status_envio_cliente?: string | null
          status_financeiro?: string | null
          tipo_documento?: string | null
          updated_at?: string
          urgencia_tipo?: string | null
          valor?: number | null
          vencimento: string
        }
        Update: {
          ajuste_fiscal?: string | null
          ajuste_operacao?: string | null
          aprovado_por_user_id?: string | null
          cliente_email?: string | null
          cnpj_fornecedor?: string | null
          cobranca_em_nome_de?: string
          comentarios_financeiro?: string | null
          comentarios_fiscal?: string | null
          comentarios_operacao?: string | null
          created_at?: string
          criado_por_user_id?: string | null
          data_emissao_documento?: string | null
          etapa_atual?: string
          filial?: string | null
          forma_pagamento?: string
          fornecedor?: string | null
          id?: string
          moeda?: string | null
          numero_spo?: string
          origem_criacao?: string | null
          remessa?: string | null
          responsavel_financeiro_user_id?: string | null
          responsavel_fiscal_user_id?: string | null
          responsavel_operacao_user_id?: string | null
          responsavel_supervisor_user_id?: string | null
          status_baixa?: string | null
          status_envio_cliente?: string | null
          status_financeiro?: string | null
          tipo_documento?: string | null
          updated_at?: string
          urgencia_tipo?: string | null
          valor?: number | null
          vencimento?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "OPERACAO"
        | "FISCAL"
        | "SUPERVISOR"
        | "FINANCEIRO"
        | "GESTOR_OPERACAO"
        | "GESTOR_FISCAL"
        | "GESTOR_SUPERVISOR"
        | "GESTOR_FINANCEIRO"
        | "ADMIN"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "OPERACAO",
        "FISCAL",
        "SUPERVISOR",
        "FINANCEIRO",
        "GESTOR_OPERACAO",
        "GESTOR_FISCAL",
        "GESTOR_SUPERVISOR",
        "GESTOR_FINANCEIRO",
        "ADMIN",
      ],
    },
  },
} as const
