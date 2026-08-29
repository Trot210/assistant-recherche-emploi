import type { Offre } from "@/types/offre";
import type { Score } from "@/types/score";
import type { Candidature } from "@/types/candidature";

export interface OffreAvecDetails extends Omit<Offre, "description"> {
  // undefined = pas encore récupérée (voir app/page.tsx et
  // /api/offres/[id]) ; null = récupérée, l'offre n'a pas de description.
  description: string | null | undefined;
  score: Score | null;
  candidature: Candidature | null;
}
