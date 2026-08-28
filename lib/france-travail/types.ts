// Formes (partielles) des réponses de l'API France Travail "Offres d'emploi v2".
// Seuls les champs utilisés par l'application sont typés explicitement.

export interface FranceTravailOffre {
  id: string;
  intitule: string;
  description?: string;
  dateCreation?: string;
  typeContrat?: string;
  entreprise?: {
    nom?: string;
  };
  lieuTravail?: {
    libelle?: string;
    commune?: string;
    codePostal?: string;
  };
  origineOffre?: {
    urlOrigine?: string;
  };
}

export interface FranceTravailSearchResponse {
  resultats: FranceTravailOffre[];
  filtresPossibles?: unknown[];
}

export interface FranceTravailSearchParams {
  motsCles?: string;
  departement?: string;
  commune?: string;
  distance?: number;
  typeContrat?: string;
  range?: string; // ex: "0-49"
  minCreationDate?: string; // ISO-8601
  // 0 = pertinence, 1 = date de création décroissante (le plus récent en
  // premier), 2 = distance croissante.
  sort?: 0 | 1 | 2;
}
