// Mémorisation des filtres du dashboard entre deux visites, dans le
// localStorage du navigateur (donc propre à chaque appareil/navigateur, rien
// n'est envoyé au serveur). La recherche texte et la page courante ne sont
// volontairement pas mémorisées : elles redeviendraient une surprise au
// retour ("pourquoi je ne vois que 3 offres ?").

export interface FiltresDashboard {
  source: string;
  contrat: string;
  tri: string;
  localisation: string;
  notation: string;
  statut: string;
}

export const FILTRES_PAR_DEFAUT: FiltresDashboard = {
  source: "Toutes",
  contrat: "Toutes",
  tri: "score-desc",
  localisation: "Toutes",
  notation: "Toutes",
  statut: "Toutes",
};

const CLE_STOCKAGE = "le-rayon:filtres:v1";

const VALEURS_AUTORISEES: Record<Exclude<keyof FiltresDashboard, "source">, string[]> = {
  contrat: ["Toutes", "CDI", "CDD", "Alternance", "Stage", "Autre"],
  tri: ["score-desc", "score-asc", "date-desc"],
  localisation: ["Toutes", "Paris", "IDF"],
  notation: ["Toutes", "Notees", "NonNotees"],
  statut: ["Toutes", "Envoyees"],
};

interface StockageMinimal {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

// Une valeur stockée peut être périmée (option supprimée depuis) ou
// corrompue : on ne garde que ce qui est reconnu, champ par champ, plutôt que
// de tout jeter ou — pire — de laisser le dashboard filtré sur une valeur
// qui ne correspond à aucun bouton.
export function lireFiltresSauvegardes(stockage: StockageMinimal | null): FiltresDashboard {
  const resultat = { ...FILTRES_PAR_DEFAUT };
  if (!stockage) return resultat;
  try {
    const brut = stockage.getItem(CLE_STOCKAGE);
    if (!brut) return resultat;
    const lu = JSON.parse(brut) as Partial<Record<keyof FiltresDashboard, unknown>>;
    if (typeof lu.source === "string" && lu.source.length > 0) resultat.source = lu.source;
    for (const champ of Object.keys(VALEURS_AUTORISEES) as (keyof typeof VALEURS_AUTORISEES)[]) {
      const valeur = lu[champ];
      if (typeof valeur === "string" && VALEURS_AUTORISEES[champ].includes(valeur)) {
        resultat[champ] = valeur;
      }
    }
  } catch {
    // JSON illisible ou stockage inaccessible : on retombe sur les défauts.
  }
  return resultat;
}

export function sauvegarderFiltres(stockage: StockageMinimal | null, filtres: FiltresDashboard): void {
  if (!stockage) return;
  try {
    stockage.setItem(CLE_STOCKAGE, JSON.stringify(filtres));
  } catch {
    // Quota dépassé ou navigation privée : la mémorisation est un confort,
    // son échec ne doit jamais gêner l'utilisation.
  }
}
