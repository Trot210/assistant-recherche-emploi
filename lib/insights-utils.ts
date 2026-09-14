import { estParisIntraMuros } from "@/lib/dashboard-utils";

// Toutes les fonctions de ce fichier sont volontairement gratuites : aucune
// n'appelle Claude ni aucune autre API payante. Elles ne font que ré-analyser
// des données déjà en base (scores déjà calculés, catalogue d'offres déjà
// synchronisé, profil déjà renseigné) pour en tirer plus de valeur sans
// dépenser de crédit supplémentaire.

export interface ThemeEcart {
  theme: string;
  count: number;
}

// Les "écarts" renvoyés par le scoring sont du texte libre généré par Claude
// (pas une catégorie structurée) — cette classification par mots-clés est
// donc une approximation heuristique, pas une vérité absolue : un écart peut
// matcher plusieurs thèmes, et une formulation inhabituelle peut n'en
// matcher aucun (il reste alors simplement non classé, sans faire planter
// le calcul).
const THEMES_ECARTS: { theme: string; motif: RegExp }[] = [
  { theme: "Langue", motif: /\b(anglais|langue|toeic|toefl|bilingue|english|espagnol|allemand)\b/i },
  { theme: "Expérience / ancienneté", motif: /\b(expérience|ancienneté|junior|senior|ans d'expérience|confirmé)\b/i },
  { theme: "Formation / diplôme", motif: /\b(diplôme|formation|bac\s*\+\s*\d|master|licence|école|certifi\w*)\b/i },
  { theme: "Secteur / domaine", motif: /\b(secteur|domaine|industrie|environnement)\b/i },
  { theme: "Localisation / mobilité", motif: /\b(localisation|déplacement|mobilité|site|région|proximité)\b/i },
  { theme: "Outils / compétences techniques", motif: /\b(logiciel|outil|sap|excel|erp|crm|sql|python)\b/i },
  { theme: "Management / encadrement", motif: /\b(management|encadrement|équipe|manager|hiérarchique)\b/i },
];

export function analyserEcarts(listesEcarts: string[][]): ThemeEcart[] {
  const compteurs = new Map<string, number>();
  for (const ecarts of listesEcarts) {
    for (const ecart of ecarts) {
      for (const { theme, motif } of THEMES_ECARTS) {
        if (motif.test(ecart)) {
          compteurs.set(theme, (compteurs.get(theme) ?? 0) + 1);
        }
      }
    }
  }
  return Array.from(compteurs.entries())
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count);
}

export interface MoyenneParGroupe {
  groupe: string;
  moyenne: number;
  total: number;
}

export function moyenneParGroupe(items: { groupe: string; score: number }[]): MoyenneParGroupe[] {
  const parGroupe = new Map<string, number[]>();
  for (const { groupe, score } of items) {
    const liste = parGroupe.get(groupe) ?? [];
    liste.push(score);
    parGroupe.set(groupe, liste);
  }
  return Array.from(parGroupe.entries())
    .map(([groupe, scores]) => ({
      groupe,
      moyenne: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      total: scores.length,
    }))
    .sort((a, b) => b.moyenne - a.moyenne);
}

export function bucketLocalisation(localisation: string | null): string {
  if (!localisation) return "Non précisée";
  return estParisIntraMuros(localisation) ? "Paris intra-muros" : "IDF hors Paris";
}

// Normalisation volontairement simple (minuscules, accents retirés, mentions
// de contrat/genre courantes supprimées, espaces compressés) — suffisante
// pour repérer des republications quasi identiques de la même offre, pas
// pour un vrai rapprochement flou (deux intitulés reformulés différemment
// ne seront pas rapprochés, par choix : mieux vaut rater un doublon que
// masquer à tort deux offres réellement distinctes).
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(h\s*\/\s*f\)|\(f\s*\/\s*h\)|\bh\/f\b|\bf\/h\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export interface GroupeDoublons {
  cle: string;
  titre: string;
  entreprise: string;
  count: number;
  ids: string[];
}

export function detecterDoublons(
  offres: { id: string; titre: string; entreprise: string | null; localisation: string | null }[],
): GroupeDoublons[] {
  // La localisation fait partie de la clé : les agences d'intérim republient
  // souvent le même intitulé générique pour des postes réels différents,
  // ville par ville (constaté en production — 83 offres "Conseiller de
  // clientèle" chez la même agence, une par ville) — sans elle, ces offres
  // bien distinctes seraient à tort comptées comme des doublons.
  const parCle = new Map<string, { titre: string; entreprise: string; ids: string[] }>();
  for (const o of offres) {
    if (!o.entreprise) continue;
    const cle = `${normaliser(o.titre)}|${normaliser(o.entreprise)}|${normaliser(o.localisation ?? "")}`;
    const entree = parCle.get(cle) ?? { titre: o.titre, entreprise: o.entreprise, ids: [] };
    entree.ids.push(o.id);
    parCle.set(cle, entree);
  }
  return Array.from(parCle.entries())
    .filter(([, v]) => v.ids.length > 1)
    .map(([cle, v]) => ({ cle, titre: v.titre, entreprise: v.entreprise, count: v.ids.length, ids: v.ids }))
    .sort((a, b) => b.count - a.count);
}

export interface OffreProteeHeuristique {
  id: string;
  titre: string;
  scoreHeuristique: number;
}

function motsSignificatifs(texte: string): string[] {
  return normaliser(texte)
    .split(" ")
    .filter((mot) => mot.length >= 3);
}

// Score gratuit basé sur le chevauchement de mots entre le titre de l'offre
// et les intitulés ciblés du profil — sert à repérer, parmi les offres non
// notées, lesquelles ont le plus de chances d'être pertinentes avant de
// dépenser du crédit sur un vrai scoring Claude. Ce n'est qu'un proxy
// lexical (pas de compréhension du métier) : une offre peut chevaucher les
// mots sans être réellement pertinente, et inversement.
export function preTrierParMotsCles(
  offresNonNotees: { id: string; titre: string }[],
  intitulesCibles: string[],
): OffreProteeHeuristique[] {
  const motsCibles = intitulesCibles.map((intitule) => new Set(motsSignificatifs(intitule)));

  return offresNonNotees
    .map((o) => {
      const motsTitre = new Set(motsSignificatifs(o.titre));
      let scoreHeuristique = 0;
      for (const cible of motsCibles) {
        let chevauchement = 0;
        for (const mot of cible) {
          if (motsTitre.has(mot)) chevauchement++;
        }
        if (chevauchement > 0) {
          scoreHeuristique += chevauchement / cible.size;
        }
      }
      return { id: o.id, titre: o.titre, scoreHeuristique: Math.round(scoreHeuristique * 100) / 100 };
    })
    .filter((o) => o.scoreHeuristique > 0)
    .sort((a, b) => b.scoreHeuristique - a.scoreHeuristique);
}
