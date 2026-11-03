export interface FaitSource {
  texte: string;
  source_url: string;
}

export interface AdresseCandidature {
  email: string;
  source_url: string;
  // true quand l'adresse apparaît mot pour mot dans un extrait cité de la
  // page source ; sinon l'utilisateur doit la vérifier sur la page.
  confirmee: boolean;
}

export interface ContactPublic {
  nom: string;
  poste: string | null;
  // Conservée uniquement si confirmée par un extrait cité.
  email: string | null;
  source_url: string;
}

export interface PosteSuggere {
  poste: string;
  raison: string;
}

export interface Fiche {
  // Comment la fiche a été établie : en lisant le site (par défaut), ou par recherche web
  // quand le site de l'entreprise refuse la lecture automatique.
  lecture?: "site" | "recherche_web";
  site_web: string | null;
  activite: string;
  marques: FaitSource[];
  enjeux: FaitSource[];
  actualites: FaitSource[];
  adresse_candidature: AdresseCandidature | null;
  contacts_publics: ContactPublic[];
  postes_suggeres: PosteSuggere[];
  // Date de la dernière recherche Hunter pour cette entreprise : évite de
  // relancer (et de consommer le quota) quand elle n'avait rien donné.
  hunter_recherche_at?: string | null;
  // Format des adresses de l'entreprise renvoyé par Hunter (ex : "{first}.{last}").
  hunter_pattern?: string | null;
}
