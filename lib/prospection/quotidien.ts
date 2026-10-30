import type { Prospection } from "@/types/prospection";
import { estEnCours, MAX_RELANCES, relanceDue } from "@/lib/prospection/workflow";

// Choix des relances à préparer chaque matin. Calcul pur.

export const MAX_RELANCES_PAR_JOUR = 3;

// Messages initiaux envoyés sans réponse dont la relance est due, sans relance
// déjà en préparation, les plus anciens d'abord, dans la limite quotidienne.
export function relancesAPreparer(
  prospections: Pick<Prospection, "id" | "type" | "statut" | "prochaine_relance" | "nb_relances" | "parent_id">[],
  aujourdhui: string,
  max = MAX_RELANCES_PAR_JOUR,
): string[] {
  const enPreparation = new Set(prospections.filter((p) => p.parent_id && estEnCours(p.statut)).map((p) => p.parent_id));

  return prospections
    .filter(
      (p) =>
        p.type === "initial" &&
        relanceDue(p, aujourdhui) &&
        p.nb_relances < MAX_RELANCES &&
        !enPreparation.has(p.id),
    )
    .sort((a, b) => (a.prochaine_relance ?? "") .localeCompare(b.prochaine_relance ?? ""))
    .slice(0, max)
    .map((p) => p.id);
}
