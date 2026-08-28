import type { Offre } from "@/types/offre";
import type { Score } from "@/types/score";
import type { Candidature } from "@/types/candidature";

export interface OffreAvecDetails extends Offre {
  score: Score | null;
  candidature: Candidature | null;
}
