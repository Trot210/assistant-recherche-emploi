// Vérification continue des offres encore en ligne.
//
// La synchro ne sait qu'AJOUTER des offres : une annonce clôturée ou pourvue
// côté France Travail restait indéfiniment dans la base (jusqu'à la purge par
// ancienneté), et son lien menait à la page "offre clôturée". Constaté en
// production : environ la moitié du catalogue était dans ce cas.
//
// À chaque synchro, on vérifie donc un petit lot d'offres auprès de l'API
// officielle (200 = en ligne, 204 = clôturée) et on supprime celles qui sont
// clôturées. Le lot tourne sur l'horloge, comme la rotation des mots-clés :
// aucun état à stocker, et tout le catalogue est couvert en quelques jours.

export interface FenetreVerification {
  debut: number;
  fin: number;
}

export function fenetreVerification(
  total: number,
  tailleLot: number,
  maintenant: number,
  intervalleMs: number,
): FenetreVerification {
  if (total <= 0 || tailleLot <= 0) return { debut: 0, fin: -1 };
  const creneau = Math.floor(maintenant / intervalleMs);
  const debut = (creneau * tailleLot) % total;
  return { debut, fin: Math.min(debut + tailleLot, total) - 1 };
}
