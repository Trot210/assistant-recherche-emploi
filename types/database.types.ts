// Types générés manuellement à partir des migrations SQL (supabase/migrations).
// A régénérer avec `supabase gen types typescript` une fois le projet Supabase lié.

export type OffreSource = "france_travail" | "apec";
export type CandidatureStatut = "a_traiter" | "envoyee" | "entretien" | "refusee";

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
          source: OffreSource;
          source_id: string;
          lien_original: string;
          localisation: string | null;
          date_publication: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          titre: string;
          entreprise?: string | null;
          description?: string | null;
          source: OffreSource;
          source_id: string;
          lien_original: string;
          localisation?: string | null;
          date_publication?: string | null;
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
    Functions: { [_ in never]: never };
    Enums: {
      offre_source: OffreSource;
      candidature_statut: CandidatureStatut;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
