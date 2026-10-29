import type { Prospection } from "@/types/prospection";
import type { ProspectionStatut } from "@/types/database.types";

// Délais (en jours) avant chaque relance : 7 jours après le premier
// message, puis 14 jours après la première relance. Au-delà de deux
// relances, on arrête — insister davantage dessert la candidature.
export const DELAIS_RELANCE_JOURS = [7, 14] as const;
export const MAX_RELANCES = DELAIS_RELANCE_JOURS.length;

export type ActionProspection = "valider" | "marquer_envoyee" | "reponse_recue" | "sans_suite";

// Date du jour à Paris au format AAAA-MM-JJ : `new Date().toISOString()`
// donnerait la date UTC, qui est celle de la veille entre minuit et 1h/2h.
export function aujourdhuiParis(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

export function ajouterJours(dateIso: string, jours: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

// Date de la prochaine relance à planifier une fois un message envoyé, ou
// null quand toutes les relances prévues l'ont déjà été.
export function calculerProchaineRelance(dateEnvoi: string, nbRelancesEnvoyees: number): string | null {
  const delai = DELAIS_RELANCE_JOURS[nbRelancesEnvoyees];
  return delai === undefined ? null : ajouterJours(dateEnvoi, delai);
}

export function relanceDue(prospection: Pick<Prospection, "statut" | "prochaine_relance">, aujourdhui: string): boolean {
  return (
    prospection.statut === "envoyee" &&
    prospection.prochaine_relance !== null &&
    prospection.prochaine_relance <= aujourdhui
  );
}

const STATUTS_ENVOYABLES: ProspectionStatut[] = ["valide", "brouillon_gmail"];
const STATUTS_EN_COURS: ProspectionStatut[] = ["a_valider", "valide", "brouillon_gmail"];

export interface TransitionProspection {
  // Champs à écrire sur le message ciblé.
  message: Partial<Prospection>;
  // Champs à écrire sur le message initial quand l'action cible une relance.
  parent?: Partial<Prospection>;
  // Quand le fil se clôt, les brouillons de relance non envoyés sont abandonnés.
  abandonnerRelancesEnCours?: boolean;
}

// Décide, sans toucher à la base, ce qu'une action change. Toute règle de
// passage d'un statut à l'autre est ici pour rester testable — et pour
// garantir qu'un message ne peut être "envoyé" sans avoir été validé.
export function appliquerAction(
  prospection: Prospection,
  parent: Prospection | null,
  action: ActionProspection,
  aujourdhui: string,
): TransitionProspection | { erreur: string } {
  switch (action) {
    case "valider":
      if (prospection.statut !== "a_valider") {
        return { erreur: "Seul un message « à valider » peut être validé" };
      }
      return { message: { statut: "valide" } };

    case "marquer_envoyee": {
      if (!STATUTS_ENVOYABLES.includes(prospection.statut)) {
        return { erreur: "Valide le message avant de le marquer comme envoyé" };
      }
      if (prospection.type === "relance") {
        if (!parent) return { erreur: "Message initial introuvable pour cette relance" };
        const nbRelances = parent.nb_relances + 1;
        return {
          message: { statut: "envoyee", date_envoi: aujourdhui },
          parent: {
            nb_relances: nbRelances,
            prochaine_relance: calculerProchaineRelance(aujourdhui, nbRelances),
          },
        };
      }
      return {
        message: {
          statut: "envoyee",
          date_envoi: aujourdhui,
          prochaine_relance: calculerProchaineRelance(aujourdhui, prospection.nb_relances),
        },
      };
    }

    case "reponse_recue":
    case "sans_suite": {
      if (prospection.statut !== "envoyee") {
        return { erreur: "Ce message n'a pas encore été envoyé" };
      }
      const fin = { statut: action, prochaine_relance: null } as const;
      // La réponse à une relance clôt tout le fil : c'est le message initial
      // qui porte le statut affiché dans la liste.
      return prospection.type === "relance" && parent
        ? { message: { statut: action }, parent: fin, abandonnerRelancesEnCours: true }
        : { message: fin, abandonnerRelancesEnCours: true };
    }
  }
}

export function estEnCours(statut: ProspectionStatut): boolean {
  return STATUTS_EN_COURS.includes(statut);
}
