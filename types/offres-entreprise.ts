import type { LienRecherche, OffreTrouvee } from "@/lib/prospection/offres";

// Réponse de /api/prospection/entreprises/[id]/offres.
export interface VerificationOffres {
  offres: OffreTrouvee[];
  liens: LienRecherche[];
  sources: { base: boolean; france_travail: boolean };
  verifiees_at: string;
}
