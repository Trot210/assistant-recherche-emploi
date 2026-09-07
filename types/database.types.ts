// Types générés manuellement à partir des migrations SQL (supabase/migrations).
// A régénérer avec `supabase gen types typescript` une fois le projet Supabase lié.

export type CandidatureStatut =
  | "a_traiter"
  | "envoyee"
  | "reponse_recue"
  | "entretien"
  | "refusee"
  | "offre";

export interface SousSection {
  titre: string;
  points: string[];
}

export interface Experience {
  poste: string;
  entreprise: string;
  lieu?: string;
  date_debut: string;
  date_fin: string | null;
  sous_sections: SousSection[];
}

export interface Preferences {
  localisations: string[];
  types_contrat: string[];
  [key: string]: unknown;
}

export interface Contact {
  nom?: string;
  localisation?: string;
  telephone?: string;
  email?: string;
  langues?: string[];
  outils?: string[];
  autre?: string[];
}

export interface FormationEntry {
  periode: string;
  intitule: string;
  etablissement?: string;
}

export interface Activites {
  loisirs?: string;
  sport?: string;
}

export interface Database {
  public: {
    Tables: {
      profil: {
        Row: {
          id: string;
          user_id: string;
          cv_texte: string | null;
          competences: string[];
          experiences: Experience[];
          preferences: Preferences;
          contact: Contact;
          formation: FormationEntry[];
          activites: Activites;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          cv_texte?: string | null;
          competences?: string[];
          experiences?: Experience[];
          preferences?: Preferences;
          contact?: Contact;
          formation?: FormationEntry[];
          activites?: Activites;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profil"]["Insert"]>;
        Relationships: [];
      };
      offres: {
        Row: {
          id: string;
          user_id: string;
          titre: string;
          entreprise: string | null;
          description: string | null;
          source: string;
          source_id: string;
          lien_original: string;
          localisation: string | null;
          date_publication: string | null;
          type_contrat: string | null;
          type_contrat_libelle: string | null;
          alternance: boolean;
          stage: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          titre: string;
          entreprise?: string | null;
          description?: string | null;
          source: string;
          source_id: string;
          lien_original: string;
          localisation?: string | null;
          date_publication?: string | null;
          type_contrat?: string | null;
          type_contrat_libelle?: string | null;
          alternance?: boolean;
          stage?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["offres"]["Insert"]>;
        Relationships: [];
      };
      scores: {
        Row: {
          id: string;
          user_id: string;
          offre_id: string;
          score: number;
          points_forts: string[];
          ecarts: string[];
          calculated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          offre_id: string;
          score: number;
          points_forts?: string[];
          ecarts?: string[];
          calculated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scores"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "scores_offre_id_fkey";
            columns: ["offre_id"];
            isOneToOne: true;
            referencedRelation: "offres";
            referencedColumns: ["id"];
          },
        ];
      };
      candidatures: {
        Row: {
          id: string;
          user_id: string;
          offre_id: string;
          date_envoi: string | null;
          statut: CandidatureStatut;
          cv_genere_url: string | null;
          lm_generee_url: string | null;
          message_motivation: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          offre_id: string;
          date_envoi?: string | null;
          statut?: CandidatureStatut;
          cv_genere_url?: string | null;
          lm_generee_url?: string | null;
          message_motivation?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["candidatures"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "candidatures_offre_id_fkey";
            columns: ["offre_id"];
            isOneToOne: true;
            referencedRelation: "offres";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    // Non régénéré automatiquement (pas d'accès CLI/DB direct depuis cet
    // environnement) — déclarées à la main pour correspondre exactement aux
    // fonctions SQL de supabase/migrations/0011_offres_filtrees_rpc.sql.
    // À tenir manuellement en phase avec cette migration si elle évolue.
    Functions: {
      offres_filtrees: {
        Args: {
          p_recherche?: string;
          p_source?: string;
          p_contrat?: string;
          p_localisation?: string;
          p_notation?: string;
          p_statut?: string;
          p_tri?: string;
          p_page?: number;
          p_taille_page?: number;
          p_user_id?: string | null;
        };
        Returns: {
          id: string;
          titre: string;
          entreprise: string | null;
          source: string;
          source_id: string;
          lien_original: string;
          localisation: string | null;
          date_publication: string | null;
          created_at: string;
          type_contrat: string | null;
          type_contrat_libelle: string | null;
          alternance: boolean;
          stage: boolean;
          score: number | null;
          points_forts: string[] | null;
          ecarts: string[] | null;
          candidature_statut: CandidatureStatut | null;
          candidature_date_envoi: string | null;
          candidature_cv_genere_url: string | null;
          candidature_lm_generee_url: string | null;
          candidature_message_motivation: string | null;
          total_count: number;
        }[];
      };
      offres_stats: {
        Args: { p_user_id?: string | null };
        Returns: {
          total: number;
          fortes: number;
          moyenne: number;
          documents_prets: number;
          non_notees: number;
          envoyees: number;
          sources: string[];
        }[];
      };
    };
    Enums: {
      candidature_statut: CandidatureStatut;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
