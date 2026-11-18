// Fiche de préparation d'un entretien, rédigée une seule fois par Claude à partir du mail d'invitation et du
// profil du candidat, puis gardée en base. Calcul pur : forme de la fiche et nettoyage de ce que renvoie le modèle.

export interface FicheEntretien {
  resume: string;
  infos_pratiques: string[];
  questions_probables: string[];
  points_forts: string[];
  questions_a_poser: string[];
  a_verifier: string[];
}

const MAX = { resume: 500, element: 300, liste: 6 } as const;

function nettoyerListe(valeurs: unknown, max: number): string[] {
  if (!Array.isArray(valeurs)) return [];
  return valeurs
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/\s+/g, " ").trim().slice(0, MAX.element))
    .filter(Boolean)
    .slice(0, max);
}

// Valide et borne une fiche lue en base ou renvoyée par le modèle ; null si elle est inutilisable.
export function assainirFiche(brut: unknown): FicheEntretien | null {
  if (!brut || typeof brut !== "object") return null;
  const f = brut as Record<string, unknown>;
  const resume = typeof f.resume === "string" ? f.resume.replace(/\s+/g, " ").trim().slice(0, MAX.resume) : "";
  const fiche: FicheEntretien = {
    resume,
    infos_pratiques: nettoyerListe(f.infos_pratiques, MAX.liste),
    questions_probables: nettoyerListe(f.questions_probables, MAX.liste),
    points_forts: nettoyerListe(f.points_forts, 5),
    questions_a_poser: nettoyerListe(f.questions_a_poser, 4),
    a_verifier: nettoyerListe(f.a_verifier, 5),
  };
  const vide = !fiche.resume && fiche.questions_probables.length === 0 && fiche.points_forts.length === 0;
  return vide ? null : fiche;
}

// Une invitation à un entretien récente, sans fiche, mérite d'en recevoir une ; au-delà de 14 jours, l'entretien a eu lieu.
export function ficheAPreparer(
  lignes: { id: string; nature: string; date_mail: string | null; fiche_entretien: unknown }[],
  maintenant = new Date(),
  jours = 14,
): string[] {
  const limite = maintenant.getTime() - jours * 86_400_000;
  return lignes
    .filter((l) => l.nature === "entretien" && !l.fiche_entretien && l.date_mail && new Date(l.date_mail).getTime() >= limite)
    .map((l) => l.id);
}
