// Ajout dans « Offres » d'une offre que l'entreprise a indiquée (ou qu'on a repérée)
// à la suite d'une réponse. Calcul pur : les contrôles faits avant d'écrire en base.

export const TITRE_MAX = 200;
export const DESCRIPTION_MAX = 20_000;

export interface OffreSaisie {
  titre: unknown;
  lien: unknown;
  description?: unknown;
  localisation?: unknown;
}

export interface OffreValidee {
  titre: string;
  lien: string;
  description: string | null;
  localisation: string | null;
}

// Un lien http(s) sans identifiants intégrés (https://user:mdp@site) : c'est le seul
// type de lien qu'on accepte de mémoriser et d'afficher comme cliquable.
export function lienOffreValide(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const lien = valeur.trim();
  if (lien.length === 0 || lien.length > 500) return null;
  try {
    const u = new URL(lien);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function validerOffre(saisie: OffreSaisie): { offre: OffreValidee } | { erreur: string } {
  const titre = typeof saisie.titre === "string" ? saisie.titre.replace(/\s+/g, " ").trim() : "";
  if (titre.length < 3) return { erreur: "Le titre de l'offre est requis (3 caractères au moins)." };
  if (titre.length > TITRE_MAX) return { erreur: `Le titre dépasse ${TITRE_MAX} caractères.` };

  const lien = lienOffreValide(saisie.lien);
  if (!lien) return { erreur: "Lien invalide : colle l'adresse complète de l'offre (https://...)." };

  let description: string | null = null;
  if (saisie.description !== undefined && saisie.description !== null && saisie.description !== "") {
    if (typeof saisie.description !== "string") return { erreur: "Description invalide." };
    if (saisie.description.length > DESCRIPTION_MAX) return { erreur: `La description dépasse ${DESCRIPTION_MAX} caractères.` };
    description = saisie.description.trim() || null;
  }

  let localisation: string | null = null;
  if (typeof saisie.localisation === "string" && saisie.localisation.trim()) localisation = saisie.localisation.trim().slice(0, 120);

  return { offre: { titre, lien, description, localisation } };
}
