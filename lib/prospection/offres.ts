import { estOffreHorsCible } from "@/lib/france-travail/prefiltre";

// Avant d'écrire à une entreprise, on cherche si elle a déjà publié une offre qui
// correspond à la candidature : écrire à froid à une entreprise qui recrute
// publiquement sur ce poste ne sert à rien, il vaut mieux postuler à l'offre.
// Calcul pur : les recherches (base d'offres, France Travail) sont dans la route.

const MOTS_GENERIQUES = new Set([
  "le", "la", "les", "l", "de", "du", "des", "et", "the", "of", "and", "par", "abreviation",
  "groupe", "group", "france", "french", "societe", "holding", "international", "europe", "europeenne",
  "sas", "sasu", "sarl", "eurl", "sa", "sca", "snc", "scop", "gie",
  "exploitation", "production", "distribution", "services", "service", "commerce", "com", "fr",
]);

function sansAccents(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Mots distinctifs d'un nom d'entreprise : sans parenthèses, sans forme juridique
// ni mot générique ("BEL (LA VACHE QUI RIT - FBSA) (F.B.S.A)" → ["bel"]).
export function motsDistinctifs(nom: string): string[] {
  return sansAccents(nom.toLowerCase())
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((m) => m.length >= 2 && !MOTS_GENERIQUES.has(m));
}

// Nom de marque utilisé pour chercher : le premier mot distinctif ("OPELLA HEALTHCARE FRANCE SAS" → "opella").
export function marqueEntreprise(nom: string): string | null {
  return motsDistinctifs(nom).find((m) => m.length >= 3) ?? motsDistinctifs(nom)[0] ?? null;
}

// Le nom d'une offre désigne-t-il cette entreprise ? On exige la marque comme mot
// entier (« bel » ne correspond pas à « Isabelle »). Le résultat est toujours
// montré à l'utilisateur avec le nom de l'employeur de l'offre, qui tranche.
export function memeEntreprise(nomEntreprise: string, nomEmployeurOffre: string | null | undefined): boolean {
  const marque = marqueEntreprise(nomEntreprise);
  if (!marque || !nomEmployeurOffre) return false;
  return motsDistinctifs(nomEmployeurOffre).includes(marque);
}

// Intitulés qui relèvent des métiers visés (category, trade marketing, produit,
// achats, business development, grands comptes, conseil), hors métiers écartés
// par le pré-filtre de la synchronisation.
const TITRE_CIBLE =
  /category|cat[ée]gor|trade market|shopper|chef de produit|chef de marque|product manager|product owner|brand manager|marketing|ach[ae]teur|achats?\b|buyer|procurement|sourcing|business develop|d[ée]veloppement commercial|key account|grands? comptes?|\bkam\b|account manager|responsable (commercial|des ventes)|consultant|merchandising|assortiment/i;

export function offrePertinente(titre: string): boolean {
  return TITRE_CIBLE.test(titre) && !estOffreHorsCible(titre);
}

export interface OffreTrouvee {
  titre: string;
  employeur: string | null;
  lieu: string | null;
  date: string | null;
  lien: string | null;
  source: "base" | "france_travail";
  // Présent quand l'offre est déjà dans la base de l'application.
  offreId: string | null;
}

export function dedoublonnerOffres(offres: OffreTrouvee[]): OffreTrouvee[] {
  const vues = new Set<string>();
  const uniques: OffreTrouvee[] = [];
  for (const o of offres) {
    const cle = o.lien || `${sansAccents(o.titre.toLowerCase())}|${sansAccents((o.employeur ?? "").toLowerCase())}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    uniques.push(o);
  }
  return uniques;
}

// Offres de la liste qui concernent l'entreprise et un poste visé, les plus
// récentes d'abord.
export function selectionnerOffres(nomEntreprise: string, offres: OffreTrouvee[]): OffreTrouvee[] {
  return dedoublonnerOffres(offres.filter((o) => memeEntreprise(nomEntreprise, o.employeur) && offrePertinente(o.titre))).sort((a, b) =>
    (a.date ?? "") < (b.date ?? "") ? 1 : -1,
  );
}

export function lienOffreFranceTravail(id: string): string {
  return `https://candidat.francetravail.fr/offres/recherche/detail/${encodeURIComponent(id)}`;
}

export interface LienRecherche {
  libelle: string;
  url: string;
}

// Recherches préparées sur les sites que l'application ne peut pas interroger
// elle-même (LinkedIn, Welcome to the Jungle, Indeed : pas d'API gratuite, et
// les parcourir automatiquement viole leurs conditions). Un clic, ta session.
export function liensRecherche(nomEntreprise: string, posteVise: string, siteWeb: string | null): LienRecherche[] {
  const marque = marqueEntreprise(nomEntreprise) ?? nomEntreprise;
  const requete = encodeURIComponent(`${marque} ${posteVise}`.trim());
  const liens: LienRecherche[] = [
    { libelle: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${requete}` },
    { libelle: "Welcome to the Jungle", url: `https://www.welcometothejungle.com/fr/jobs?query=${requete}` },
    { libelle: "Indeed", url: `https://fr.indeed.com/jobs?q=${requete}` },
  ];
  const hote = siteWeb?.replace(/^https?:\/\//, "").split("/")[0];
  if (hote) {
    liens.push({
      libelle: "Site carrières (recherche Google)",
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:${hote} carrières offres emploi ${posteVise}`)}`,
    });
  }
  return liens;
}
