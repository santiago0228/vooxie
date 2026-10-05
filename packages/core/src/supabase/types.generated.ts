/**
 * ⚠️ ARCHIVO GENERADO — no editar a mano.
 *
 * Regenerar con:
 *   supabase gen types typescript --local > packages/core/src/supabase/types.generated.ts
 *
 * Placeholder mantenido a mano mientras tanto, con las tablas hasta la
 * migración 0007 (catálogo + storage + youtube_tracks_cache + catálogo externo) inclusive.
 *
 * NOTA (fix de compatibilidad): se agregó `Relationships` a cada tabla
 * (con los nombres reales de FK de las migraciones 0001/0003: p.ej.
 * `albums_artist_id_fkey`, `tracks_artist_id_fkey`, `tracks_album_id_fkey`,
 * `track_genres_track_id_fkey`, `favorites_user_id_fkey`, etc.) y `Views: {}`
 * al schema, porque @supabase/postgrest-js (bundlado con la versión actual
 * de @supabase/supabase-js) ahora exige que el tipo cumpla estrictamente
 * con `GenericSchema`/`GenericTable`, y además usa `Relationships` para
 * validar en tiempo de tipos los `select("*, artist:artist_profiles(...)")`
 * embebidos que usa catalogService/favoritesService. Sin esto, TypeScript no
 * podía enlazar el genérico `Database` al cliente (de ahí los errores
 * TS2353/TS2345/TS2339/TS2698/TS2352 en authService, artistProfileService,
 * catalogService y favoritesService). No cambia ningún dato real ni la
 * base de Supabase — es puramente una corrección de forma del tipo. Al
 * regenerar con `supabase gen types`, la CLI ya incluye estos campos
 * automáticamente con los nombres reales de tus constraints.
 */

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          bio: string | null;
          is_public: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          bio?: string | null;
          is_public?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      artist_profiles: {
        Row: {
          id: string;
          /** null en perfiles importados (origin = "catalog"): aún sin cuenta. */
          user_id: string | null;
          display_name: string;
          bio: string | null;
          avatar_url: string | null;
          cover_url: string | null;
          verified: boolean;
          public_stats_enabled: boolean;
          origin: "platform" | "catalog";
          musicbrainz_id: string | null;
          deezer_id: number | null;
          monthly_listeners: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          cover_url?: string | null;
          verified?: boolean;
          public_stats_enabled?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["artist_profiles"]["Insert"]
        >;
        Relationships: [];
      };
      genres: {
        Row: { id: string; name: string; created_at: string };
        Insert: { id?: string; name: string };
        Update: Partial<Database["public"]["Tables"]["genres"]["Insert"]>;
        Relationships: [];
      };
      albums: {
        Row: {
          id: string;
          artist_id: string;
          title: string;
          description: string | null;
          cover_url: string | null;
          release_date: string | null;
          album_type: "album" | "ep" | "single" | "compilation";
          musicbrainz_id: string | null;
          deezer_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          artist_id: string;
          title: string;
          description?: string | null;
          cover_url?: string | null;
          release_date?: string | null;
          album_type?: "album" | "ep" | "single" | "compilation";
        };
        Update: Partial<Database["public"]["Tables"]["albums"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "albums_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artist_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tracks: {
        Row: {
          id: string;
          album_id: string | null;
          artist_id: string;
          title: string;
          description: string | null;
          /** null en canciones importadas: el audio sale de `youtube_id` (resolveTrack). */
          audio_url: string | null;
          youtube_id: string | null;
          musicbrainz_id: string | null;
          deezer_id: number | null;
          isrc: string | null;
          release_date: string | null;
          cover_url: string | null;
          duration_seconds: number;
          track_number: number | null;
          is_explicit: boolean;
          feats: string[];
          status: "draft" | "published";
          plays_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          album_id?: string | null;
          artist_id: string;
          title: string;
          description?: string | null;
          audio_url: string;
          cover_url?: string | null;
          duration_seconds?: number;
          track_number?: number | null;
          is_explicit?: boolean;
          feats?: string[];
          status?: "draft" | "published";
          plays_count?: number;
        };
        Update: Partial<Database["public"]["Tables"]["tracks"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "tracks_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artist_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tracks_album_id_fkey";
            columns: ["album_id"];
            isOneToOne: false;
            referencedRelation: "albums";
            referencedColumns: ["id"];
          },
        ];
      };
      track_genres: {
        Row: { track_id: string; genre_id: string };
        Insert: { track_id: string; genre_id: string };
        Update: Partial<
          Database["public"]["Tables"]["track_genres"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "track_genres_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "track_genres_genre_id_fkey";
            columns: ["genre_id"];
            isOneToOne: false;
            referencedRelation: "genres";
            referencedColumns: ["id"];
          },
        ];
      };
      favorites: {
        Row: { user_id: string; track_id: string; created_at: string };
        Insert: { user_id: string; track_id: string };
        Update: Partial<Database["public"]["Tables"]["favorites"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "favorites_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorites_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
        ];
      };
      track_artists: {
        Row: {
          track_id: string;
          artist_id: string;
          role: "primary" | "featured";
          position: number;
        };
        // Solo service_role escribe (importador/admin); la app únicamente lee.
        Insert: {
          track_id: string;
          artist_id: string;
          role?: "primary" | "featured";
          position?: number;
        };
        Update: Partial<Database["public"]["Tables"]["track_artists"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "track_artists_track_id_fkey";
            columns: ["track_id"];
            isOneToOne: false;
            referencedRelation: "tracks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "track_artists_artist_id_fkey";
            columns: ["artist_id"];
            isOneToOne: false;
            referencedRelation: "artist_profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_tracks: {
        Row: { user_id: string; track_key: string; snapshot: Record<string, unknown>; created_at: string };
        Insert: { user_id: string; track_key: string; snapshot: Record<string, unknown> };
        Update: never;
        Relationships: [];
      };
      playlists: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          cover_url: string | null;
          is_public: boolean;
          is_collaborative: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          cover_url?: string | null;
          is_public?: boolean;
          is_collaborative?: boolean;
        };
        Update: Partial<Pick<Database["public"]["Tables"]["playlists"]["Insert"], "name" | "description" | "cover_url" | "is_public" | "is_collaborative">>;
        Relationships: [
          {
            foreignKeyName: "playlist_members_playlist_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "playlist_members";
            referencedColumns: ["playlist_id"];
          },
          {
            foreignKeyName: "playlist_items_playlist_id_fkey";
            columns: ["id"];
            isOneToOne: false;
            referencedRelation: "playlist_items";
            referencedColumns: ["playlist_id"];
          },
        ];
      };
      playlist_members: {
        Row: { playlist_id: string; user_id: string; added_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      playlist_items: {
        Row: {
          id: string;
          playlist_id: string;
          track_key: string;
          snapshot: Record<string, unknown>;
          added_by: string;
          position: number;
          added_at: string;
        };
        Insert: { playlist_id: string; track_key: string; snapshot: Record<string, unknown>; added_by: string };
        Update: never;
        Relationships: [];
      };
      track_matches: {
        Row: { deezer_id: number; youtube_id: string; created_at: string };
        // Solo la Edge Function (service_role) escribe; la app únicamente lee.
        Insert: { deezer_id: number; youtube_id: string };
        Update: Partial<Database["public"]["Tables"]["track_matches"]["Insert"]>;
        Relationships: [];
      };
      youtube_tracks_cache: {
        Row: {
          youtube_id: string;
          title: string;
          artist: string;
          artwork_url: string | null;
          stream_url: string | null;
          duration: number | null;
          canvas_url: string | null;
          producers: string[];
          stream_expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // La app NO escribe esta tabla (solo lectura por RLS). Los tipos de
        // Insert/Update existen para cumplir GenericTable; escribe la Edge Function.
        Insert: {
          youtube_id: string;
          title: string;
          artist: string;
          artwork_url?: string | null;
          stream_url?: string | null;
          duration?: number | null;
          canvas_url?: string | null;
          producers?: string[];
          stream_expires_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["youtube_tracks_cache"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      artist_tracks: {
        Row: {
          artist_id: string;
          role: "primary" | "featured";
          track_id: string;
          title: string;
          album_id: string | null;
          cover_url: string | null;
          duration_seconds: number;
          youtube_id: string | null;
          audio_url: string | null;
          is_explicit: boolean;
          released_on: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_username_available: {
        Args: { check_username: string };
        Returns: boolean;
      };
      resolve_login_identifier: {
        Args: { identifier: string };
        Returns: string | null;
      };
      is_artist: {
        Args: { uid?: string };
        Returns: boolean;
      };
      admin_set_track_extras: {
        Args: {
          p_youtube_id: string;
          p_canvas_url?: string | null;
          p_producers?: string[] | null;
          p_clear_canvas?: boolean;
        };
        Returns: Database["public"]["Tables"]["youtube_tracks_cache"]["Row"];
      };
      add_playlist_member: {
        Args: { p_playlist_id: string; p_username: string };
        Returns: Database["public"]["Tables"]["playlist_members"]["Row"];
      };
      playlist_member_names: {
        Args: { p_playlist_id: string };
        Returns: { user_id: string; username: string }[];
      };
      search_artists: {
        Args: { q: string; max_results?: number };
        Returns: Database["public"]["Tables"]["artist_profiles"]["Row"][];
      };
      is_admin: {
        Args: { uid?: string };
        Returns: boolean;
      };
      increment_track_plays: {
        Args: { track_id_input: string };
        Returns: void;
      };
    };
  };
};
