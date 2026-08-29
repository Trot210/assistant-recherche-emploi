// L'API France Travail ne supporte qu'un seul mot-clé/phrase par requête
// (les virgules ne fonctionnent pas comme un "OU") : le sync boucle sur
// chaque mot-clé pour chaque département.
export const TOUS_MOTS_CLES = [
  "category manager",
  "acheteur",
  "chef de produit",
  "marketing",
  "trade marketing",
  "commercial",
  "key account manager",
  "KAM",
  "category manager junior",
  "assistant category manager",
  "acheteur junior",
  "acheteur confirmé",
  "chef de groupe marketing",
  "chef de marché",
  "responsable gamme",
  "responsable de catégorie",
  "chargé d'études marché",
  "chef de secteur",
  "business developer",
  "chargé d'affaires",
  "responsable grands comptes",
  "account manager",
  "sales manager",
  "responsable merchandising",
  "chef de rayon",
  "responsable achats",
  "product manager",
  "brand manager",
  "chef de produit junior",
  "chargé de développement commercial",
  "responsable trade marketing",
];

// La liste complète est trop longue pour tenir dans une seule invocation
// (31 mots-clés × 8 départements ≈ 250 requêtes, bien au-delà de ce que
// maxDuration=60 permet face au rate-limit France Travail) : chaque appel
// ne traite qu'un lot, choisi par rotation déterministe sur l'horloge —
// pas d'état à stocker, la synchro (toutes les 20 min) couvre l'ensemble
// des mots-clés en un peu plus d'une heure.
export const TAILLE_LOT_MOTS_CLES = 8;

export function selectionnerLotMotsCles(
  motsCles: string[],
  tailleLot: number,
  maintenant: number,
  intervalleMs: number,
): string[] {
  const nbLots = Math.ceil(motsCles.length / tailleLot);
  const indexLot = Math.floor(maintenant / intervalleMs) % nbLots;
  return motsCles.slice(indexLot * tailleLot, indexLot * tailleLot + tailleLot);
}
