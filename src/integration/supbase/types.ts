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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string
          dealer_id: string | null
          details: Json | null
          id: string
          inventory_item_id: string | null
          invoice_id: string | null
          performed_by: string | null
        }
        Insert: {
          action: string
          created_at?: string
          dealer_id?: string | null
          details?: Json | null
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          dealer_id?: string | null
          details?: Json | null
          id?: string
          inventory_item_id?: string | null
          invoice_id?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      dealers: {
        Row: {
          address: string | null
          contact_number: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          address?: string | null
          contact_number?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          added_by: string | null
          brand: string | null
          category: string
          date_added: string
          description: string | null
          id: string
          model_name: string | null
          photo_url: string | null
          ram: string | null
          screen_size: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["item_status"]
          storage: string | null
          tag_code: string
          unit_cost_price: number
          unit_sale_price: number
        }
        Insert: {
          added_by?: string | null
          brand?: string | null
          category: string
          date_added?: string
          description?: string | null
          id?: string
          model_name?: string | null
          photo_url?: string | null
          ram?: string | null
          screen_size?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          storage?: string | null
          tag_code: string
          unit_cost_price?: number
          unit_sale_price?: number
        }
        Update: {
          added_by?: string | null
          brand?: string | null
          category?: string
          date_added?: string
          description?: string | null
          id?: string
          model_name?: string | null
          photo_url?: string | null
          ram?: string | null
          screen_size?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["item_status"]
          storage?: string | null
          tag_code?: string
          unit_cost_price?: number
          unit_sale_price?: number
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: string
          inventory_item_id: string
          invoice_id: string
          line_total: number
          quantity: number
          unit_price: number
        }
        Insert: {
          id?: string
          inventory_item_id: string
          invoice_id: string
          line_total: number
          quantity?: number
          unit_price: number
        }
        Update: {
          id?: string
          inventory_item_id?: string
          invoice_id?: string
          line_total?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_received: number
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          invoice_number: string
          remarks: string | null
          sale_date: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
        }
        Insert: {
          amount_received?: number
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          invoice_number: string
          remarks?: string | null
          sale_date?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
        }
        Update: {
          amount_received?: number
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          invoice_number?: string
          remarks?: string | null
          sale_date?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          dealer_id: string
          id: string
          invoice_id: string | null
          method: string
          payment_date: string
          remarks: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          dealer_id: string
          id?: string
          invoice_id?: string | null
          method?: string
          payment_date?: string
          remarks?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          dealer_id?: string
          id?: string
          invoice_id?: string | null
          method?: string
          payment_date?: string
          remarks?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          address: string | null
          contact: string | null
          currency: string
          id: number
          logo_url: string | null
          shop_name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact?: string | null
          currency?: string
          id?: number
          logo_url?: string | null
          shop_name?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact?: string | null
          currency?: string
          id?: number
          logo_url?: string | null
          shop_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_users: {
        Row: {
          id: string
          user_id: string
          email: string
          requested_at: string
          status: "pending" | "approved" | "rejected"
          reviewed_by: string | null
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          email: string
          requested_at?: string
          status?: "pending" | "approved" | "rejected"
          reviewed_by?: string | null
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          email?: string
          requested_at?: string
          status?: "pending" | "approved" | "rejected"
          reviewed_by?: string | null
          reviewed_at?: string | null
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
          role?: Database["public"]["Enums"]["app_role"]
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
      approve_user: {
        Args: { _user_id: string; _role?: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      reject_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      revoke_user_access: {
        Args: { _user_id: string }
        Returns: undefined
      }
      delete_user: {
        Args: { _user_id: string }
        Returns: undefined
      }
      add_inventory_batch: {
        Args: {
          _brand: string
          _category: string
          _description: string
          _model_name: string
          _photo_url: string
          _quantity: number
          _ram: string
          _screen_size: string
          _serial_number: string
          _storage: string
          _unit_cost_price: number
          _unit_sale_price: number
        }
        Returns: {
          added_by: string | null
          brand: string | null
          category: string
          date_added: string
          description: string | null
          id: string
          model_name: string | null
          photo_url: string | null
          ram: string | null
          screen_size: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["item_status"]
          storage: string | null
          tag_code: string
          unit_cost_price: number
          unit_sale_price: number
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_sale: {
        Args: {
          _amount_received: number
          _dealer_id: string
          _item_ids: string[]
          _remarks: string
          _unit_prices: number[]
        }
        Returns: string
      }
      generate_invoice_number: { Args: never; Returns: string }
      generate_tag_code: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated_user: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff"
      invoice_status: "paid" | "partial" | "unpaid"
      item_status: "in_stock" | "sold" | "reserved"
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
      app_role: ["admin", "staff"],
      invoice_status: ["paid", "partial", "unpaid"],
      item_status: ["in_stock", "sold", "reserved"],
    },
  },
} as const
