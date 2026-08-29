export interface PaletteScore {
  bg: string;
  text: string;
}

// Échelle à 5 paliers façon jauge (rouge = faible, vert = fort), pensée
// comme une fonction pure réutilisable partout où un score doit être
// affiché (carte, panneau de détail, futures vues) plutôt que des classes
// CSS conditionnelles éparpillées dans chaque composant.
const PALIERS_SCORE: { seuil: number; bg: string; text: string }[] = [
  { seuil: 85, bg: "#DCEFD8", text: "#1F5C2E" }, // excellent match
  { seuil: 70, bg: "#E9F2C9", text: "#5A7A1E" }, // bon match
  { seuil: 50, bg: "#FBEFD4", text: "#8A5A00" }, // match correct
  { seuil: 30, bg: "#FBE0CE", text: "#B5551A" }, // match faible
  { seuil: 0, bg: "#F9DEDE", text: "#B02323" }, // match très faible
];

export function paletteScore(score: number): PaletteScore {
  const s = Math.max(0, Math.min(100, score));
  const palier = PALIERS_SCORE.find((p) => s >= p.seuil) ?? PALIERS_SCORE[PALIERS_SCORE.length - 1];
  return { bg: palier.bg, text: palier.text };
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

export type CandidatureStatut =
  | "a_traiter"
  | "envoyee"
  | "reponse_recue"
  | "entretien"
  | "refusee"
  | "offre";

// Ordre d'affichage du pipeline, du moins au plus avancé (hors "à traiter",
// qui précède l'envoi et n'apparaît pas dans le suivi des candidatures).
export const STATUTS_CANDIDATURE_ORDRE: CandidatureStatut[] = [
  "a_traiter",
  "envoyee",
  "reponse_recue",
  "entretien",
  "refusee",
  "offre",
];

export function libelleStatutCandidature(statut: CandidatureStatut): string {
  switch (statut) {
    case "a_traiter":
      return "À traiter";
    case "envoyee":
      return "Envoyée";
    case "reponse_recue":
      return "Réponse reçue";
    case "entretien":
      return "Entretien";
    case "refusee":
      return "Refusée";
    case "offre":
      return "Offre reçue";
  }
}

// Une candidature au statut "à traiter" n'a pas encore été envoyée — le
// suivi des candidatures et le masquage par défaut sur le dashboard
// principal ne concernent que ce qui a dépassé cette étape.
export function estEnvoyeeOuPlus(statut: CandidatureStatut | null | undefined): boolean {
  return statut != null && statut !== "a_traiter";
}

export function domaine(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
