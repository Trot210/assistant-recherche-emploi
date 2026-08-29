// Trois paliers : succès / avertissement / neutre. Un score bas n'est pas
// une "erreur" à signaler en rouge sur chaque carte — le gris neutre évite
// la fatigue visuelle sur un grand volume d'offres, à la différence des
// stats agrégées (voir couleurScoreMoyen/couleurFortesCorrespondances) où
// une vraie alerte a du sens.
export function couleurMatch(score: number | null | undefined): string {
  if (score == null) return "#D9D3C2"; // var(--line), pas encore noté
  if (score >= 70) return "#1f6f5c"; // var(--emerald), succès
  if (score >= 50) return "#b8791e"; // var(--amber), avertissement
  return "#585f6b"; // var(--ink-soft), neutre
}

// Pour les stats agrégées du haut de page : ici une valeur basse mérite une
// vraie alerte (rouge), contrairement au badge par offre ci-dessus.
export function couleurScoreMoyen(moyenne: number): string {
  if (moyenne >= 70) return "#1f6f5c";
  if (moyenne >= 50) return "#b8791e";
  return "#a8412b"; // var(--brick)
}

export function couleurFortesCorrespondances(nombre: number): string {
  if (nombre >= 5) return "#1f6f5c";
  if (nombre >= 1) return "#b8791e";
  return "#a8412b";
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
