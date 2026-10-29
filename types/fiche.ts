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
  site_web: string | null;
  activite: string;
  marques: FaitSource[];
  enjeux: FaitSource[];
  actualites: FaitSource[];
  adresse_candidature: AdresseCandidature | null;
  contacts_publics: ContactPublic[];
  postes_suggeres: PosteSuggere[];
}
