// Pré-filtre appliqué à l'insertion lors de la synchro : écarte les offres
// dont l'intitulé relève de métiers clairement hors cible (conseiller
// bancaire, agent immobilier, vendeur, aide à domicile, métiers manuels...).
// Les mots-clés de recherche France Travail ("commercial", "marketing",
// "chargé d'affaires"...) ramènent aussi des offres sans rapport avec le
// profil, et chacune alourdit la base, la page, et le coût d'un éventuel
// scoring.
//
// Choix délibérément conservateur : liste d'exclusion (ce qu'on écarte), pas
// de liste blanche (ce qu'on garde) — une liste blanche raterait des
// intitulés atypiques mais pertinents (ex : "Responsable pôle Non Food").
// Les motifs ont été validés sur le catalogue réel : aucune offre notée à 25 %
// ou plus n'est écartée. Ils ne s'appliquent qu'aux NOUVELLES insertions :
// une offre déjà en base (et ses candidatures) n'est jamais touchée.

const MOTIFS_HORS_CIBLE: RegExp[] = [
  // Banque / assurance grand public
  /\bconseill\w* (de |en )?clientele\b/,
  /\bconseill\w* (bancaire|financier|en assurance|en gestion de patrimoine)/,
  /\bagence bancaire\b/,
  /\bcharge\w* de clientele (particuliers|en agence)\b/,
  /\bgestionnaire de clientele\b/,
  // Immobilier
  /\bimmobilier\b/,
  // Vente en magasin
  /\bemploye\w* (commercial|polyvalent|de rayon|de libre)/,
  /\bvendeu\w+\b/,
  /\bcaissi\w+\b/,
  /\bhote\w* de caisse\b/,
  /\bconseill\w* (de vente|commercial\w* en)\b/,
  // Santé / services à la personne
  /\baide a domicile\b/,
  /\baide soignant/,
  /\bauxiliaire\b/,
  /\binfirmi\w+\b/,
  /\bgarde d enfants\b/,
  /\bassistan\w* maternel/,
  /\bmedecin\b/,
  /\baide menager/,
  // Métiers manuels / techniques
  /\btechnicien\w*\b/,
  /\belectricien/,
  /\bplombier/,
  /\bchauffeur/,
  /\blivreur/,
  /\bmagasinier/,
  /\bcariste/,
  /\bmanutentionn/,
  /\bmecanicien/,
  /\bsoudeur/,
  /\bmacon\b/,
  /\bpeintre\b/,
  /\bmenuisier/,
  /\bcuisinier/,
  /\bserveu\w+\b/,
  /\bagent de securite\b/,
  /\bagent d entretien\b/,
  /\bouvrier/,
  /\bcouvreur/,
  /\bchaudronnier/,
  /\bagent de nettoyage\b/,
  /\bfemme de chambre\b/,
  /\bboulanger/,
  /\bboucher\b/,
  /\bcoiffeu\w+/,
];

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function estOffreHorsCible(titre: string): boolean {
  const normalise = normaliser(titre);
  return MOTIFS_HORS_CIBLE.some((motif) => motif.test(normalise));
}
