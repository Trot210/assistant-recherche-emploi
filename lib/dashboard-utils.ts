export type Bande = "high" | "mid" | "low" | "none";

export function bande(score: number | null | undefined): Bande {
  if (score == null) return "none";
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  return "low";
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
