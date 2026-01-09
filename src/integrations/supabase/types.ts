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
      analise_documental_historico: {
        Row: {
          analysis: Json | null
          comparison: Json | null
          created_at: string
          created_by_user_id: string | null
          error_count: number | null
          excel_file_name: string
          excel_summary: Json | null
          id: string
          metadata: Json | null
          overall_status: string | null
          pdf_file_name: string
          pdf_summary: Json | null
          success_count: number | null
          total_items: number | null
          warning_count: number | null
        }
        Insert: {
          analysis?: Json | null
          comparison?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          error_count?: number | null
          excel_file_name: string
          excel_summary?: Json | null
          id?: string
          metadata?: Json | null
          overall_status?: string | null
          pdf_file_name: string
          pdf_summary?: Json | null
          success_count?: number | null
          total_items?: number | null
          warning_count?: number | null
        }
        Update: {
          analysis?: Json | null
          comparison?: Json | null
          created_at?: string
          created_by_user_id?: string | null
          error_count?: number | null
          excel_file_name?: string
          excel_summary?: Json | null
          id?: string
          metadata?: Json | null
          overall_status?: string | null
          pdf_file_name?: string
          pdf_summary?: Json | null
          success_count?: number | null
          total_items?: number | null
          warning_count?: number | null
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
