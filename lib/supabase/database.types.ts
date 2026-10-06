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
      account_members: {
        Row: {
          account_code: string
          created_at: string
          id: string
          last_ordered_at: string | null
          name: string
          order_count: number
          phone: string | null
        }
        Insert: {
          account_code: string
          created_at?: string
          id?: string
          last_ordered_at?: string | null
          name: string
          order_count?: number
          phone?: string | null
        }
        Update: {
          account_code?: string
          created_at?: string
          id?: string
          last_ordered_at?: string | null
          name?: string
          order_count?: number
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_members_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_code"]
          },
        ]
      }
      accounts: {
        Row: {
          account_code: string
          account_name: string
          account_number: number
          account_type: Database["public"]["Enums"]["account_type"]
          business_number: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string
          current_balance: number
          is_active: boolean
          memo: string | null
          organization_name: string | null
          pin_code: string
          store_id: string | null
          updated_at: string
          warning_threshold: number
        }
        Insert: {
          account_code?: string
          account_name: string
          account_number?: number
          account_type: Database["public"]["Enums"]["account_type"]
          business_number?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          current_balance?: number
          is_active?: boolean
          memo?: string | null
          organization_name?: string | null
          pin_code: string
          store_id?: string | null
          updated_at?: string
          warning_threshold?: number
        }
        Update: {
          account_code?: string
          account_name?: string
          account_number?: number
          account_type?: Database["public"]["Enums"]["account_type"]
          business_number?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string
          current_balance?: number
          is_active?: boolean
          memo?: string | null
          organization_name?: string | null
          pin_code?: string
          store_id?: string | null
          updated_at?: string
          warning_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_adjustments: {
        Row: {
          account_code: string | null
          adjusted_by: string | null
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string | null
          id: string
          orderer_name: string | null
          reason: string | null
          store_id: string | null
        }
        Insert: {
          account_code?: string | null
          adjusted_by?: string | null
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          id?: string
          orderer_name?: string | null
          reason?: string | null
          store_id?: string | null
        }
        Update: {
          account_code?: string | null
          adjusted_by?: string | null
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          id?: string
          orderer_name?: string | null
          reason?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "balance_adjustments_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "balance_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          auth_user_id: string
          business_name: string
          business_number: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          memo: string | null
          owner_name: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          auth_user_id: string
          business_name?: string
          business_number?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          memo?: string | null
          owner_name?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          auth_user_id?: string
          business_name?: string
          business_number?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          memo?: string | null
          owner_name?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      demo_orders: {
        Row: {
          account_name: string
          created_at: string | null
          delivery_fee: number
          id: string
          items: Json
          method: string
          orderer: string
          prep_minutes: number | null
          status: string
          subtotal: number
          total: number
        }
        Insert: {
          account_name?: string
          created_at?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          method?: string
          orderer?: string
          prep_minutes?: number | null
          status?: string
          subtotal?: number
          total?: number
        }
        Update: {
          account_name?: string
          created_at?: string | null
          delivery_fee?: number
          id?: string
          items?: Json
          method?: string
          orderer?: string
          prep_minutes?: number | null
          status?: string
          subtotal?: number
          total?: number
        }
        Relationships: []
      }
      deposits: {
        Row: {
          account_code: string
          amount: number
          balance_after: number
          created_at: string
          deposit_id: string
          note: string | null
          payment_method: string
        }
        Insert: {
          account_code: string
          amount: number
          balance_after?: number
          created_at?: string
          deposit_id?: string
          note?: string | null
          payment_method?: string
        }
        Update: {
          account_code?: string
          amount?: number
          balance_after?: number
          created_at?: string
          deposit_id?: string
          note?: string | null
          payment_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_code"]
          },
        ]
      }
      menu_option_groups: {
        Row: {
          display_order: number
          menu_id: string
          option_group_id: string
        }
        Insert: {
          display_order?: number
          menu_id: string
          option_group_id: string
        }
        Update: {
          display_order?: number
          menu_id?: string
          option_group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_option_groups_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_option_groups_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_menu_with_options"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "menu_option_groups_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          base_price: number
          category_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_hidden: boolean
          is_new: boolean
          is_popular: boolean
          is_recommended: boolean
          is_sold_out: boolean
          name: string
          sold_out_until: string | null
          updated_at: string
        }
        Insert: {
          base_price: number
          category_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          is_new?: boolean
          is_popular?: boolean
          is_recommended?: boolean
          is_sold_out?: boolean
          name: string
          sold_out_until?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          category_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_hidden?: boolean
          is_new?: boolean
          is_popular?: boolean
          is_recommended?: boolean
          is_sold_out?: boolean
          name?: string
          sold_out_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_menu_with_options"
            referencedColumns: ["category_id"]
          },
        ]
      }
      option_groups: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_hidden: boolean
          is_multi: boolean
          is_required: boolean
          is_sold_out: boolean
          max_select: number | null
          min_select: number
          name: string
          sold_out_until: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_hidden?: boolean
          is_multi?: boolean
          is_required?: boolean
          is_sold_out?: boolean
          max_select?: number | null
          min_select?: number
          name: string
          sold_out_until?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_hidden?: boolean
          is_multi?: boolean
          is_required?: boolean
          is_sold_out?: boolean
          max_select?: number | null
          min_select?: number
          name?: string
          sold_out_until?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      option_items: {
        Row: {
          created_at: string
          display_order: number
          extra_price: number
          id: string
          is_hidden: boolean
          is_popular: boolean
          is_sold_out: boolean
          name: string
          option_group_id: string
          sold_out_until: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          extra_price?: number
          id?: string
          is_hidden?: boolean
          is_popular?: boolean
          is_sold_out?: boolean
          name: string
          option_group_id: string
          sold_out_until?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          extra_price?: number
          id?: string
          is_hidden?: boolean
          is_popular?: boolean
          is_sold_out?: boolean
          name?: string
          option_group_id?: string
          sold_out_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "option_items_option_group_id_fkey"
            columns: ["option_group_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_options: {
        Row: {
          extra_price: number
          id: string
          option_item_id: string
          option_name: string
          order_item_id: string
        }
        Insert: {
          extra_price?: number
          id?: string
          option_item_id: string
          option_name: string
          order_item_id: string
        }
        Update: {
          extra_price?: number
          id?: string
          option_item_id?: string
          option_name?: string
          order_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_options_option_item_id_fkey"
            columns: ["option_item_id"]
            isOneToOne: false
            referencedRelation: "option_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_options_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      order_items: {
        Row: {
          menu_id: string
          menu_name: string
          order_code: string
          order_item_id: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          menu_id: string
          menu_name: string
          order_code: string
          order_item_id?: string
          quantity: number
          subtotal: number
          unit_price: number
        }
        Update: {
          menu_id?: string
          menu_name?: string
          order_code?: string
          order_item_id?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "v_menu_with_options"
            referencedColumns: ["menu_id"]
          },
          {
            foreignKeyName: "order_items_order_code_fkey"
            columns: ["order_code"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["order_code"]
          },
        ]
      }
      orders: {
        Row: {
          account_code: string
          balance_after: number
          balance_before: number
          created_at: string
          delivery_departed_at: string | null
          delivery_fee: number
          is_deleted: boolean
          menu_subtotal: number
          method: Database["public"]["Enums"]["order_method"]
          note: string | null
          order_code: string
          order_number: string
          ordered_at: string
          orderer_name: string
          orderer_phone: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          account_code: string
          balance_after: number
          balance_before: number
          created_at?: string
          delivery_departed_at?: string | null
          delivery_fee?: number
          is_deleted?: boolean
          menu_subtotal: number
          method: Database["public"]["Enums"]["order_method"]
          note?: string | null
          order_code?: string
          order_number: string
          ordered_at?: string
          orderer_name: string
          orderer_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          account_code?: string
          balance_after?: number
          balance_before?: number
          created_at?: string
          delivery_departed_at?: string | null
          delivery_fee?: number
          is_deleted?: boolean
          menu_subtotal?: number
          method?: Database["public"]["Enums"]["order_method"]
          note?: string | null
          order_code?: string
          order_number?: string
          ordered_at?: string
          orderer_name?: string
          orderer_phone?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_code_fkey"
            columns: ["account_code"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["account_code"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_vacation_days: {
        Row: {
          close_time: string | null
          created_at: string | null
          date: string
          id: string
          note: string | null
          open_time: string | null
          store_id: string
          type: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string | null
          date: string
          id?: string
          note?: string | null
          open_time?: string | null
          store_id: string
          type: string
        }
        Update: {
          close_time?: string | null
          created_at?: string | null
          date?: string
          id?: string
          note?: string | null
          open_time?: string | null
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_vacation_days_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          auto_open_enabled: boolean
          break_time: Json | null
          client_id: string
          created_at: string
          id: string
          is_open: boolean
          name: string
          operating_hours: Json | null
          phone: string | null
          today_override: Json | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          auto_open_enabled?: boolean
          break_time?: Json | null
          client_id: string
          created_at?: string
          id?: string
          is_open?: boolean
          name: string
          operating_hours?: Json | null
          phone?: string | null
          today_override?: Json | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          auto_open_enabled?: boolean
          break_time?: Json | null
          client_id?: string
          created_at?: string
          id?: string
          is_open?: boolean
          name?: string
          operating_hours?: Json | null
          phone?: string | null
          today_override?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_events: {
        Row: {
          account_code: string | null
          created_at: string | null
          event_name: string
          id: string
          platform: string | null
          properties: Json | null
          session_id: string
        }
        Insert: {
          account_code?: string | null
          created_at?: string | null
          event_name: string
          id?: string
          platform?: string | null
          properties?: Json | null
          session_id: string
        }
        Update: {
          account_code?: string | null
          created_at?: string | null
          event_name?: string
          id?: string
          platform?: string | null
          properties?: Json | null
          session_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_account_ledger: {
        Row: {
          account_code: string | null
          account_name: string | null
          amount: number | null
          kind: string | null
          note: string | null
          occurred_at: string | null
          order_number: string | null
          order_total: number | null
          orderer_name: string | null
        }
        Relationships: []
      }
      v_menu_with_options: {
        Row: {
          base_price: number | null
          category_id: string | null
          category_name: string | null
          description: string | null
          display_order: number | null
          image_url: string | null
          is_hidden: boolean | null
          is_popular: boolean | null
          is_sold_out: boolean | null
          menu_id: string | null
          menu_name: string | null
          option_groups: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_deposit:
        | {
            Args: {
              p_account_code: string
              p_amount: number
              p_note?: string
              p_payment_method?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_account_code: string
              p_amount: number
              p_created_at?: string
              p_note?: string
              p_payment_method?: string
            }
            Returns: string
          }
      approve_order: { Args: { p_order_code: string }; Returns: Json }
      auto_close_stores_by_schedule: { Args: never; Returns: undefined }
      cancel_order: {
        Args: {
          p_allow_after_cooking?: boolean
          p_note?: string
          p_order_code: string
        }
        Returns: Json
      }
      create_order: {
        Args: {
          p_account_code: string
          p_delivery_fee?: number
          p_items: Json
          p_method: Database["public"]["Enums"]["order_method"]
          p_note?: string
          p_orderer_name: string
          p_orderer_phone?: string
        }
        Returns: Json
      }
      delete_my_account: { Args: never; Returns: undefined }
      find_pin: {
        Args: {
          p_account_code?: string
          p_name: string
          p_phone: string
          p_store_id: string
        }
        Returns: {
          account_name: string
          pin_code: string
        }[]
      }
      get_order_status: {
        Args: { p_order_code: string }
        Returns: {
          delivery_departed_at: string
          method: string
          note: string
          status: string
        }[]
      }
      get_order_statuses: {
        Args: { p_order_codes: string[] }
        Returns: {
          order_code: string
          status: string
        }[]
      }
      my_store_ids: { Args: never; Returns: string[] }
      update_deposit: {
        Args: {
          p_amount: number
          p_deposit_id: string
          p_note?: string
          p_payment_method?: string
        }
        Returns: undefined
      }
      update_order_status: {
        Args: {
          p_order_code: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "과" | "기업" | "개인" | "기타"
      client_plan: "basic" | "pro" | "enterprise"
      order_method: "포장" | "내점" | "배달"
      order_status: "주문완료" | "조리중" | "완료" | "취소"
      plan_tier: "free" | "basic" | "pro" | "max"
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
      account_type: ["과", "기업", "개인", "기타"],
      client_plan: ["basic", "pro", "enterprise"],
      order_method: ["포장", "내점", "배달"],
      order_status: ["주문완료", "조리중", "완료", "취소"],
      plan_tier: ["free", "basic", "pro", "max"],
    },
  },
} as const
