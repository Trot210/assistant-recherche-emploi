import { preTrierParMotsCles, type OffreProteeHeuristique } from "@/lib/insights-utils";

// "Nouvelles offres depuis ta dernière visite" : la date de dernière visite
// est mémorisée dans le localStorage (propre à chaque navigateur, rien côté
// serveur). Elle n'avance QUE quand l'utilisateur clique "Marquer comme vu" —
// la faire avancer à chaque chargement ferait disparaître le bandeau au
// premier rafraîchissement, avant qu'on ait pu le lire.

const CLE_VISITE = "le-rayon:derniere-visite:v1";

// Au moins un intitulé ciblé entièrement retrouvé dans le titre (voir
// preTrierParMotsCles : chaque intitulé ciblé pèse au plus 1). En dessous, un
// seul mot commun ("manager") suffirait à faire remonter du bruit.
export const SEUIL_PERTINENCE = 1;

interface StockageMinimal {
  getItem(cle: string): string | null;
  setItem(cle: string, valeur: string): void;
}

export function lireDerniereVisite(stockage: StockageMinimal | null): string | null {
  if (!stockage) return null;
  try {
    const brut = stockage.getItem(CLE_VISITE);
    if (!brut) return null;
    return Number.isNaN(Date.parse(brut)) ? null : brut;
  } catch {
    return null;
  }
}

export function enregistrerVisite(stockage: StockageMinimal | null, maintenant: Date): void {
  if (!stockage) return;
  try {
    stockage.setItem(CLE_VISITE, maintenant.toISOString());
  } catch {
    // Mémorisation de confort : son échec ne doit rien bloquer.
  }
}

export function selectionnerNouvellesPertinentes(
  offres: { id: string; titre: string }[],
  intitulesCibles: string[],
): OffreProteeHeuristique[] {
  return preTrierParMotsCles(offres, intitulesCibles).filter(
    (o) => o.scoreHeuristique >= SEUIL_PERTINENCE,
  );
}
