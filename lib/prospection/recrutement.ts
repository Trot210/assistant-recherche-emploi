import { marqueEntreprise, memeEntreprise, offrePertinente } from "@/lib/prospection/offres";

// Employeurs qui ont publié récemment des offres sur tes postes ciblés : un besoin
// réel, donc une bonne raison de postuler et d'écrire au responsable du métier.
// Calcul pur sur les offres déjà en base.

export interface OffreRecente {
  titre: string;
  entreprise: string | null;
  localisation: string | null;
  lien_original: string | null;
  created_at: string;
  alternance?: boolean | null;
  stage?: boolean | null;
}

export interface EmployeurQuiRecrute {
  employeur: string;
  marque: string;
  offres: { titre: string; lieu: string | null; lien: string | null; date: string }[];
}

// Cabinets de recrutement, agences d'intérim et portails : ils publient pour le
// compte d'autres entreprises, ce ne sont pas des employeurs à contacter.
const AGENCES =
  /recrut|int[eé]rim|\bhays\b|randstad|manpower|adecco|synergie|\bcrit\b|proman|expectra|michael page|robert half|walters|page personnel|talent|staffing|cabinet|chasseur|\bjob\b|emploi|placement|ressources humaines|\brh\b|adequat|partnaire|actual\b|samsic|start people|gi group|kelly|spring|lhh|externatic|aquila|portage|freelance|consulting rh|ingenierie rh|\bfed\b|\bltd\b|collective\.work|s&you|defi rh|kall'?up|\bcfa\b|\becole\b|\bformation|academy|campus|iscod/i;

// Administrations, santé, écoles, banques et associations : hors des secteurs ciblés pour une candidature spontanée.
const PUBLIC = /minist|interminist|prefecture|\bmairie\b|ville de|conseil (departemental|regional)|\bhopital\b|\bchu\b|universite|direction (generale|departementale|interministerielle)|etablissement public|hospitalier|\bclinique\b|\behpad\b|\bschool\b|epitech|\bcaisse\b|credit mutuel|\bbanque\b|\bassurance|\bmutuelle\b|\bassociation\b/i;

// Contrats qui ne conviennent pas à une candidature de salarié : alternance, stage, freelance.
const CONTRAT_HORS_CIBLE = /alternance|apprenti|\bstage\b|stagiaire|freelance|\bmission\b/i;

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "");
}

export function estAgenceRecrutement(nom: string): boolean {
  const propre = sansAccents(nom);
  return AGENCES.test(propre) || PUBLIC.test(propre);
}

export function estContratHorsCible(o: Pick<OffreRecente, "titre" | "alternance" | "stage">): boolean {
  return o.alternance === true || o.stage === true || CONTRAT_HORS_CIBLE.test(sansAccents(o.titre));
}

export function employeursQuiRecrutent(offres: OffreRecente[], dejaCibles: string[], max = 15): EmployeurQuiRecrute[] {
  const groupes = new Map<string, EmployeurQuiRecrute>();

  for (const o of offres) {
    if (!o.entreprise || !offrePertinente(o.titre) || estContratHorsCible(o) || estAgenceRecrutement(o.entreprise)) continue;
    const marque = marqueEntreprise(o.entreprise);
    if (!marque || dejaCibles.some((nom) => memeEntreprise(nom, o.entreprise))) continue;

    const groupe = groupes.get(marque) ?? { employeur: o.entreprise, marque, offres: [] };
    if (!groupe.offres.some((x) => x.titre === o.titre && x.lieu === o.localisation)) {
      groupe.offres.push({ titre: o.titre, lieu: o.localisation, lien: o.lien_original || null, date: o.created_at.slice(0, 10) });
    }
    groupes.set(marque, groupe);
  }

  return [...groupes.values()]
    .map((g) => ({ ...g, offres: [...g.offres].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3) }))
    .sort((a, b) => b.offres.length - a.offres.length || (a.offres[0].date < b.offres[0].date ? 1 : -1))
    .slice(0, max);
}
