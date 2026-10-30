import type { PolitiqueCandidature } from "@/types/database.types";
import type { ContactEntreprise, Entreprise } from "@/types/prospection";

// Note de priorité d'une entreprise, de 0 à 100 : où écrire en premier ? Des
// règles simples et lisibles (pas d'IA, rien à payer), avec les raisons
// affichées. Les pondérations sont des choix de départ, faciles à ajuster.

const SECTEURS_COEUR = new Set([
  "Agroalimentaire",
  "Boissons et spiritueux",
  "Beauté, hygiène et entretien",
  "Grande distribution (GMS)",
  "Santé grand public",
  "Négoce et grossistes alimentaires",
]);
const SECTEURS_PROCHES = new Set([
  "Distribution spécialisée",
  "E-commerce et marketplaces",
  "Conseil, études et marketing retail",
  "Équipement de la maison, sport et loisirs",
]);

// Codes d'effectif INSEE : les postes de category ou de trade marketing se
// trouvent surtout dans les structures de plus de 250 salariés.
const POINTS_TAILLE: Record<string, number> = {
  "53": 20, "52": 20, "51": 20, "42": 20, "41": 18, "32": 14, "31": 8, "22": 8, "21": 3,
  "12": 3, "11": 3, "03": 3, "02": 3, "01": 3, "00": 3,
};

const POSTE_UTILE = /category|cat[ée]gor|trade|shopper|marketing|brand|marque|produit|product|ach(at|et)|purchas|buyer|commerc|sales|key account|\bkam\b|business develop/i;

export interface EntreeScore {
  entreprise: Pick<
    Entreprise,
    "statut" | "secteur" | "tranche_effectif" | "departement" | "politique_candidature" | "offre_reperee_url" | "offre_reperee_titre" | "contact_interne"
  >;
  contacts: Pick<ContactEntreprise, "email" | "generique" | "poste" | "email_statut" | "email_verification">[];
  // Messages déjà rédigés ou envoyés à cette entreprise.
  nbMessages: number;
}

export interface Priorite {
  score: number;
  // Ce qui joue en faveur de l'entreprise, puis ce qui freine, en clair.
  raisons: string[];
  freins: string[];
  // Écartée ou « ne plus contacter » : pas de note.
  exclue: boolean;
}

function pointsSecteur(secteur: string | null): { points: number; raison: string | null } {
  if (secteur && SECTEURS_COEUR.has(secteur)) return { points: 25, raison: "secteur cible" };
  if (secteur && SECTEURS_PROCHES.has(secteur)) return { points: 15, raison: "secteur proche" };
  return { points: 10, raison: null };
}

function pointsProximite(departement: string | null): { points: number; raison: string | null } {
  if (!departement) return { points: 5, raison: null };
  if (["75", "92", "93"].includes(departement)) return { points: 15, raison: `siège proche (${departement})` };
  if (["94", "95"].includes(departement)) return { points: 10, raison: `siège en Île-de-France (${departement})` };
  return { points: 6, raison: null };
}

const FREINS_POLITIQUE: Partial<Record<PolitiqueCandidature, string>> = {
  non_conservees: "ne conserve pas les candidatures spontanées",
  portail_uniquement: "candidature par son portail uniquement",
};

export function calculerPriorite({ entreprise, contacts, nbMessages }: EntreeScore): Priorite {
  if (entreprise.statut === "ecartee" || entreprise.politique_candidature === "ne_pas_recontacter") {
    return { score: 0, raisons: [], freins: ["écartée ou « ne plus contacter »"], exclue: true };
  }

  const raisons: string[] = [];
  const freins: string[] = [];
  let score = 0;

  const secteur = pointsSecteur(entreprise.secteur);
  score += secteur.points;
  if (secteur.raison) raisons.push(secteur.raison);

  const taille = entreprise.tranche_effectif ? (POINTS_TAILLE[entreprise.tranche_effectif] ?? 8) : 8;
  score += taille;
  if (taille >= 18) raisons.push("grande structure");
  else if (taille <= 3) freins.push("petite structure");

  const proximite = pointsProximite(entreprise.departement);
  score += proximite.points;
  if (proximite.raison) raisons.push(proximite.raison);

  // Joignabilité : une personne nommée, de préférence confirmée et dans le bon métier.
  const joignables = contacts.filter((c) => c.email && c.email_statut === "ok" && c.email_verification !== "invalide");
  const nominatifs = joignables.filter((c) => !c.generique);
  if (nominatifs.length > 0) {
    score += 12;
    raisons.push("contact nominatif");
    if (nominatifs.some((c) => c.email_verification === "valide")) {
      score += 10;
      raisons.push("adresse vérifiée");
    }
    if (nominatifs.some((c) => c.poste && POSTE_UTILE.test(c.poste))) {
      score += 8;
      raisons.push("contact du bon métier");
    }
  } else if (joignables.length > 0) {
    score += 4;
    freins.push("seulement une adresse générique");
  } else {
    freins.push("aucun contact joignable");
  }

  if (entreprise.contact_interne) {
    score += 10;
    raisons.push("contact interne");
  }

  if (entreprise.offre_reperee_url || entreprise.offre_reperee_titre) {
    score -= 25;
    freins.push("offre publiée : postule plutôt");
  }
  const frein = entreprise.politique_candidature ? FREINS_POLITIQUE[entreprise.politique_candidature] : undefined;
  if (frein) {
    score -= 40;
    freins.push(frein);
  }
  if (nbMessages > 0) {
    score -= 50;
    freins.push("déjà contactée");
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), raisons, freins, exclue: false };
}

export function resumerPriorite(p: Priorite): string {
  if (p.exclue) return p.freins[0] ?? "exclue";
  const plus = p.raisons.length > 0 ? p.raisons.join(", ") : "aucun atout particulier";
  return p.freins.length > 0 ? `${plus} — mais : ${p.freins.join(", ")}` : plus;
}
