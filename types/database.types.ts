import type { Fiche } from "@/types/fiche";

// Types générés manuellement à partir des migrations SQL (supabase/migrations).
// A régénérer avec `supabase gen types typescript` une fois le projet Supabase lié.

export type CandidatureStatut =
  | "a_traiter"
  | "envoyee"
  | "reponse_recue"
  | "entretien"
  | "refusee"
  | "offre";

export type EntrepriseStatut = "a_analyser" | "retenue" | "ecartee";

export type ProspectionStatut =
  | "a_valider"
  | "valide"
  | "brouillon_gmail"
  | "envoyee"
  | "reponse_recue"
  | "sans_suite";

export type ProspectionType = "initial" | "relance";

export type ContactOrigine = "manuel" | "page_publique" | "hunter";

export type Langue = "fr" | "en";

export type ReponseType = "entretien" | "offre" | "refus" | "pas_de_poste" | "cv_non_conserve" | "autre";

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
          notes: string | null;
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
          notes?: string | null;
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
      entreprises: {
        Row: {
          id: string;
          user_id: string;
          siren: string;
          nom: string;
          code_naf: string | null;
          secteur: string | null;
          tranche_effectif: string | null;
          adresse: string | null;
          code_postal: string | null;
          commune: string | null;
          departement: string | null;
          site_web: string | null;
          notes: string | null;
          statut: EntrepriseStatut;
          fiche: Fiche | null;
          fiche_generee_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          siren: string;
          nom: string;
          code_naf?: string | null;
          secteur?: string | null;
          tranche_effectif?: string | null;
          adresse?: string | null;
          code_postal?: string | null;
          commune?: string | null;
          departement?: string | null;
          site_web?: string | null;
          notes?: string | null;
          statut?: EntrepriseStatut;
          fiche?: Fiche | null;
          fiche_generee_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["entreprises"]["Insert"]>;
        Relationships: [];
      };
      contacts: {
        Row: {
          id: string;
          user_id: string;
          entreprise_id: string;
          nom: string;
          poste: string | null;
          email: string | null;
          source_email: string | null;
          source_url: string | null;
          origine: ContactOrigine;
          generique: boolean;
          pays: string | null;
          langue: Langue | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entreprise_id: string;
          nom: string;
          poste?: string | null;
          email?: string | null;
          source_email?: string | null;
          source_url?: string | null;
          origine?: ContactOrigine;
          generique?: boolean;
          pays?: string | null;
          langue?: Langue | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "contacts_entreprise_id_fkey";
            columns: ["entreprise_id"];
            isOneToOne: false;
            referencedRelation: "entreprises";
            referencedColumns: ["id"];
          },
        ];
      };
      prospections: {
        Row: {
          id: string;
          user_id: string;
          entreprise_id: string;
          contact_id: string | null;
          parent_id: string | null;
          type: ProspectionType;
          poste_vise: string;
          objet: string;
          corps: string;
          statut: ProspectionStatut;
          avertissements: string[];
          cv_path: string | null;
          gmail_draft_id: string | null;
          gmail_message_id: string | null;
          gmail_thread_id: string | null;
          langue: Langue;
          smtp_message_id: string | null;
          date_envoi: string | null;
          nb_relances: number;
          prochaine_relance: string | null;
          reponse_type: ReponseType | null;
          reponse_date: string | null;
          reponse_extrait: string | null;
          reponse_url: string | null;
          commentaire: string | null;
          prochaine_action: string | null;
          prochaine_action_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          entreprise_id: string;
          contact_id?: string | null;
          parent_id?: string | null;
          type?: ProspectionType;
          poste_vise: string;
          objet: string;
          corps: string;
          statut?: ProspectionStatut;
          avertissements?: string[];
          cv_path?: string | null;
          gmail_draft_id?: string | null;
          gmail_message_id?: string | null;
          gmail_thread_id?: string | null;
          langue?: Langue;
          smtp_message_id?: string | null;
          date_envoi?: string | null;
          nb_relances?: number;
          prochaine_relance?: string | null;
          reponse_type?: ReponseType | null;
          reponse_date?: string | null;
          reponse_extrait?: string | null;
          reponse_url?: string | null;
          commentaire?: string | null;
          prochaine_action?: string | null;
          prochaine_action_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["prospections"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "prospections_entreprise_id_fkey";
            columns: ["entreprise_id"];
            isOneToOne: false;
            referencedRelation: "entreprises";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prospections_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      reponses_traitees: {
        Row: {
          id: string;
          user_id: string;
          message_id: string;
          prospection_id: string | null;
          decision: "associee" | "ignoree";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          message_id: string;
          prospection_id?: string | null;
          decision: "associee" | "ignoree";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reponses_traitees"]["Insert"]>;
        Relationships: [];
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
