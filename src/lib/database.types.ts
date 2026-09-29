// This file is generated from the Phase 1 schema. Do not edit it by hand —
// regenerate it whenever a migration is added or changed:
//
//   supabase gen types typescript --local  > src/lib/database.types.ts
//   supabase gen types typescript --linked > src/lib/database.types.ts
//
// Schema: supabase/migrations/0001_phase1_schema.sql + 0002_consent.sql
// (docs/03-TRD §2). Every table has RLS enabled, so the client is limited to
// the anon key and these types are the only description of what it may read.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          value: number;
          note: string | null;
        };
        Insert: {
          key: string;
          value: number;
          note?: string | null;
        };
        Update: {
          key?: string;
          value?: number;
          note?: string | null;
        };
        Relationships: [];
      };
      driver_stats: {
        Row: {
          driver_id: string;
          verified_trips: number;
          verified_distance_m: number;
          first_verified_at: string | null;
          last_verified_at: string | null;
          updated_at: string;
        };
        Insert: {
          driver_id: string;
          verified_trips?: number;
          verified_distance_m?: number;
          first_verified_at?: string | null;
          last_verified_at?: string | null;
          updated_at?: string;
        };
        Update: {
          driver_id?: string;
          verified_trips?: number;
          verified_distance_m?: number;
          first_verified_at?: string | null;
          last_verified_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "driver_stats_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      loads: {
        Row: {
          id: string;
          load_code: string;
          shipper_id: string | null;
          pickup_address: string;
          pickup_lat: number;
          pickup_lng: number;
          pickup_radius_m: number;
          drop_address: string;
          drop_lat: number;
          drop_lng: number;
          drop_radius_m: number;
          planned_distance_m: number | null;
          material: string | null;
          weight_kg: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          pickup_geog: Json | null;
          drop_geog: Json | null;
        };
        Insert: {
          id?: string;
          load_code?: string;
          shipper_id?: string | null;
          pickup_address: string;
          pickup_lat: number;
          pickup_lng: number;
          pickup_radius_m?: number;
          drop_address: string;
          drop_lat: number;
          drop_lng: number;
          drop_radius_m?: number;
          planned_distance_m?: number | null;
          material?: string | null;
          weight_kg?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          pickup_geog?: Json | null;
          drop_geog?: Json | null;
        };
        Update: {
          id?: string;
          load_code?: string;
          shipper_id?: string | null;
          pickup_address?: string;
          pickup_lat?: number;
          pickup_lng?: number;
          pickup_radius_m?: number;
          drop_address?: string;
          drop_lat?: number;
          drop_lng?: number;
          drop_radius_m?: number;
          planned_distance_m?: number | null;
          material?: string | null;
          weight_kg?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          pickup_geog?: Json | null;
          drop_geog?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "loads_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "loads_shipper_id_fkey";
            columns: ["shipper_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          full_name: string;
          phone: string | null;
          preferred_language: string | null;
          is_active: boolean;
          created_at: string;
          consent_version: string | null;
          consent_at: string | null;
        };
        Insert: {
          id: string;
          role?: Database["public"]["Enums"]["user_role"];
          full_name?: string;
          phone?: string | null;
          preferred_language?: string | null;
          is_active?: boolean;
          created_at?: string;
          consent_version?: string | null;
          consent_at?: string | null;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          full_name?: string;
          phone?: string | null;
          preferred_language?: string | null;
          is_active?: boolean;
          created_at?: string;
          consent_version?: string | null;
          consent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_events: {
        Row: {
          id: number;
          trip_id: string;
          type: string;
          actor_id: string | null;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          trip_id: string;
          type: string;
          actor_id?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          trip_id?: string;
          type?: string;
          actor_id?: string | null;
          payload?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_events_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_live: {
        Row: {
          trip_id: string;
          driver_id: string;
          lat: number;
          lng: number;
          speed_mps: number | null;
          heading: number | null;
          accuracy_m: number | null;
          recorded_at: string;
          updated_at: string;
        };
        Insert: {
          trip_id: string;
          driver_id: string;
          lat: number;
          lng: number;
          speed_mps?: number | null;
          heading?: number | null;
          accuracy_m?: number | null;
          recorded_at: string;
          updated_at?: string;
        };
        Update: {
          trip_id?: string;
          driver_id?: string;
          lat?: number;
          lng?: number;
          speed_mps?: number | null;
          heading?: number | null;
          accuracy_m?: number | null;
          recorded_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_live_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_live_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_points: {
        Row: {
          id: number;
          trip_id: string;
          seq: number;
          recorded_at: string;
          received_at: string;
          lat: number;
          lng: number;
          accuracy_m: number | null;
          speed_mps: number | null;
          heading: number | null;
          altitude_m: number | null;
          is_mocked: boolean;
          geog: Json | null;
        };
        Insert: {
          id?: number;
          trip_id: string;
          seq: number;
          recorded_at: string;
          received_at?: string;
          lat: number;
          lng: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading?: number | null;
          altitude_m?: number | null;
          is_mocked?: boolean;
          geog?: Json | null;
        };
        Update: {
          id?: number;
          trip_id?: string;
          seq?: number;
          recorded_at?: string;
          received_at?: string;
          lat?: number;
          lng?: number;
          accuracy_m?: number | null;
          speed_mps?: number | null;
          heading?: number | null;
          altitude_m?: number | null;
          is_mocked?: boolean;
          geog?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_points_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          id: string;
          load_id: string;
          driver_id: string;
          vehicle_id: string;
          status: Database["public"]["Enums"]["trip_status"];
          started_at: string | null;
          ended_at: string | null;
          start_lat: number | null;
          start_lng: number | null;
          start_accuracy_m: number | null;
          end_lat: number | null;
          end_lng: number | null;
          end_accuracy_m: number | null;
          expected_points: number | null;
          tracked_distance_m: number | null;
          verification_reasons: string[];
          verification_metrics: Json | null;
          verified_at: string | null;
          reviewed_by: string | null;
          review_note: string | null;
          device_info: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          load_id: string;
          driver_id: string;
          vehicle_id: string;
          status?: Database["public"]["Enums"]["trip_status"];
          started_at?: string | null;
          ended_at?: string | null;
          start_lat?: number | null;
          start_lng?: number | null;
          start_accuracy_m?: number | null;
          end_lat?: number | null;
          end_lng?: number | null;
          end_accuracy_m?: number | null;
          expected_points?: number | null;
          tracked_distance_m?: number | null;
          verification_reasons?: string[];
          verification_metrics?: Json | null;
          verified_at?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
          device_info?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          load_id?: string;
          driver_id?: string;
          vehicle_id?: string;
          status?: Database["public"]["Enums"]["trip_status"];
          started_at?: string | null;
          ended_at?: string | null;
          start_lat?: number | null;
          start_lng?: number | null;
          start_accuracy_m?: number | null;
          end_lat?: number | null;
          end_lng?: number | null;
          end_accuracy_m?: number | null;
          expected_points?: number | null;
          tracked_distance_m?: number | null;
          verification_reasons?: string[];
          verification_metrics?: Json | null;
          verified_at?: string | null;
          reviewed_by?: string | null;
          review_note?: string | null;
          device_info?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey";
            columns: ["driver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_load_id_fkey";
            columns: ["load_id"];
            isOneToOne: false;
            referencedRelation: "loads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      vehicles: {
        Row: {
          id: string;
          registration_no: string;
          vehicle_type: string;
          owner_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          registration_no: string;
          vehicle_type: string;
          owner_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          registration_no?: string;
          vehicle_type?: string;
          owner_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      admin_force_end: {
        Args: {
          p_trip_id: string;
          p_note: string;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      admin_review_trip: {
        Args: {
          p_trip_id: string;
          p_approve: boolean;
          p_note: string;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      apply_verified_stats: {
        Args: {
          p_trip_id: string;
        };
        Returns: undefined;
      };
      can_read_trip: {
        Args: {
          p_trip_id: string;
        };
        Returns: boolean;
      };
      cancel_trip: {
        Args: {
          p_trip_id: string;
          p_note: string;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      end_trip: {
        Args: {
          p_trip_id: string;
          p_lat: number;
          p_lng: number;
          p_accuracy_m: number;
          p_ended_at: string;
          p_expected_points: number;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      handle_new_user: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_load_shipper: {
        Args: {
          p_load_id: string;
        };
        Returns: boolean;
      };
      is_trip_driver_for_load: {
        Args: {
          p_load_id: string;
        };
        Returns: boolean;
      };
      is_trip_driver_for_vehicle: {
        Args: {
          p_vehicle_id: string;
        };
        Returns: boolean;
      };
      is_vehicle_owner: {
        Args: {
          p_vehicle_id: string;
        };
        Returns: boolean;
      };
      my_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"];
      };
      on_trip_point_insert: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      record_consent: {
        Args: {
          p_version: string;
        };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      setting: {
        Args: {
          p_key: string;
        };
        Returns: number;
      };
      start_trip: {
        Args: {
          p_trip_id: string;
          p_lat: number;
          p_lng: number;
          p_accuracy_m: number;
          p_device_info?: Json;
        };
        Returns: Database["public"]["Tables"]["trips"]["Row"];
      };
      sweep_unverified_trips: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      verify_trip: {
        Args: {
          p_trip_id: string;
        };
        Returns: Database["public"]["Enums"]["trip_status"];
      };
    };
    Enums: {
      trip_status:
        | "assigned"
        | "in_progress"
        | "completed"
        | "verified"
        | "needs_review"
        | "rejected"
        | "cancelled";
      user_role: "driver" | "owner" | "shipper" | "admin";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];

/** The Phase 1 role of a signed-in user (CLAUDE.md hard rule 2). */
export type UserRole = Enums<"user_role">;

/**
 * Trip status. Only `start_trip`, `end_trip`, `admin_review_trip`, `cancel_trip`
 * and `admin_force_end` move a trip between these — the client never updates
 * `trips` directly (admins may only insert a fresh `assigned` trip).
 */
export type TripStatus = Enums<"trip_status">;

/**
 * Verification reason codes, docs/08 §3. The database raises these as a
 * `text[]` on `trips.verification_reasons`; this union keeps the app from
 * inventing codes that Postgres will never send.
 */
export const VERIFICATION_REASONS = [
  "START_OUTSIDE_PICKUP",
  "END_OUTSIDE_DROP",
  "MOCK_LOCATION",
  "TRACKING_GAP",
  "LOW_COVERAGE",
  "MISSING_POINTS",
  "SPEED_IMPLAUSIBLE",
  "GPS_JUMPS",
  "DISTANCE_TOO_SHORT",
  "DISTANCE_TOO_LONG",
] as const;

export type VerificationReason = (typeof VERIFICATION_REASONS)[number];
