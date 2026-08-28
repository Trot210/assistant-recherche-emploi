// Dégradé continu (au lieu de 3 paliers plats) pour que chaque score se
// distingue visuellement des autres, même proches — utile quand beaucoup
// d'offres se regroupent dans une même tranche (ex: la plupart entre
// 10-30%, qui seraient sinon toutes identiques en "rouge").
const POINTS_DEGRADE: [number, [number, number, number]][] = [
  [0, [168, 65, 43]], // brick
  [50, [184, 121, 30]], // amber
  [100, [31, 111, 92]], // emerald
];

function melanger(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

export function couleurMatch(score: number | null | undefined): string {
  if (score == null) return "#D9D3C2"; // var(--line), pas encore noté
  const s = Math.max(0, Math.min(100, score));
  const [debut, fin] = s <= 50 ? [POINTS_DEGRADE[0], POINTS_DEGRADE[1]] : [POINTS_DEGRADE[1], POINTS_DEGRADE[2]];
  const t = s <= 50 ? s / 50 : (s - 50) / 50;
  const [r1, g1, b1] = debut[1];
  const [r2, g2, b2] = fin[1];
  const r = melanger(r1, r2, t);
  const g = melanger(g1, g2, t);
  const b = melanger(b1, b2, t);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function estAutomatique(source: string): boolean {
  return source === "france_travail" || source === "apec";
}

export function libelleSource(source: string): string {
  if (source === "france_travail") return "France Travail";
  if (source === "apec") return "APEC";
  return source;
}

const formatteurDate = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function formaterDate(date: string | null): string {
  if (!date) return "";
  return formatteurDate.format(new Date(date));
}

export function estParisIntraMuros(localisation: string | null): boolean {
  if (!localisation) return false;
  return /\bparis\b|^75\b/i.test(localisation);
}

// Détection heuristique des stages : l'API France Travail n'a pas de champ
// fiable pour ça (contrairement à "alternance"), donc on se base sur le
// titre. Risque marginal de faux positif sur des intitulés du type
// "Coordinateur de stages" (poste encadrant des stagiaires, pas un stage).
export function detecterStage(titre: string): boolean {
  return /\bstages?\b|\binternship\b|\bintern\b/i.test(titre);
}

// Filet de sécurité en complément du champ "alternance" de l'API France
// Travail, qui rate parfois des offres bilingues (ex: "... Apprenticeship").
export function detecterAlternanceParTitre(titre: string): boolean {
  return /\balternance\b|\bapprentissage\b|\bapprenticeship\b|\bprofessionnalisation\b/i.test(
    titre,
  );
}

export type CategorieContrat = "CDI" | "CDD" | "Alternance" | "Stage" | "Autre";

interface OffreContrat {
  alternance: boolean;
  stage: boolean;
  type_contrat: string | null;
}

export function categorieContrat(offre: OffreContrat): CategorieContrat {
  if (offre.alternance) return "Alternance";
  if (offre.stage) return "Stage";
  if (offre.type_contrat === "CDI") return "CDI";
  if (offre.type_contrat === "CDD") return "CDD";
  return "Autre";
}

export function libelleTypeContrat(
  offre: OffreContrat & { type_contrat_libelle: string | null },
): string {
  const categorie = categorieContrat(offre);
  if (categorie !== "Autre") return categorie;
  return offre.type_contrat_libelle ?? offre.type_contrat ?? "Non précisé";
}

export function estStageOuAlternance(offre: OffreContrat): boolean {
  return offre.alternance || offre.stage;
}

export function domaine(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
