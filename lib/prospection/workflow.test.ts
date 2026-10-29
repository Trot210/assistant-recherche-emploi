import { describe, expect, it } from "vitest";
import type { Prospection } from "@/types/prospection";
import {
  ajouterJours,
  appliquerAction,
  calculerProchaineRelance,
  relanceDue,
} from "@/lib/prospection/workflow";

function prospection(surcharge: Partial<Prospection> = {}): Prospection {
  return {
    id: "p1",
    user_id: "u1",
    entreprise_id: "e1",
    contact_id: null,
    parent_id: null,
    type: "initial",
    poste_vise: "Category Manager",
    objet: "Candidature spontanée",
    corps: "Bonjour",
    statut: "a_valider",
    avertissements: [],
    cv_path: null,
    gmail_draft_id: null,
    gmail_message_id: null,
    gmail_thread_id: null,
    langue: "fr",
    smtp_message_id: null,
    date_envoi: null,
    nb_relances: 0,
    prochaine_relance: null,
    reponse_type: null,
    reponse_date: null,
    reponse_extrait: null,
    reponse_url: null,
    commentaire: null,
    prochaine_action: null,
    prochaine_action_date: null,
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:00:00Z",
    ...surcharge,
  };
}

describe("calendrier de relance", () => {
  it("ajoute des jours en franchissant les fins de mois", () => {
    expect(ajouterJours("2026-10-29", 7)).toBe("2026-11-05");
  });

  it("planifie J+7, puis J+14, puis plus rien", () => {
    expect(calculerProchaineRelance("2026-10-29", 0)).toBe("2026-11-05");
    expect(calculerProchaineRelance("2026-11-05", 1)).toBe("2026-11-19");
    expect(calculerProchaineRelance("2026-11-19", 2)).toBeNull();
  });

  it("ne signale une relance due que pour un message envoyé dont la date est passée", () => {
    const envoye = { statut: "envoyee" as const, prochaine_relance: "2026-11-05" };
    expect(relanceDue(envoye, "2026-11-04")).toBe(false);
    expect(relanceDue(envoye, "2026-11-05")).toBe(true);
    expect(relanceDue({ ...envoye, statut: "reponse_recue" }, "2026-11-10")).toBe(false);
    expect(relanceDue({ ...envoye, prochaine_relance: null }, "2026-11-10")).toBe(false);
  });
});

describe("appliquerAction", () => {
  it("valide uniquement un message à valider", () => {
    expect(appliquerAction(prospection(), null, "valider", "2026-10-29")).toEqual({
      message: { statut: "valide" },
    });
    expect(appliquerAction(prospection({ statut: "envoyee" }), null, "valider", "2026-10-29")).toHaveProperty(
      "erreur",
    );
  });

  it("refuse de marquer comme envoyé un message non validé", () => {
    const resultat = appliquerAction(prospection(), null, "marquer_envoyee", "2026-10-29");
    expect(resultat).toHaveProperty("erreur");
  });

  it("planifie la première relance à l'envoi du message initial", () => {
    const resultat = appliquerAction(prospection({ statut: "brouillon_gmail" }), null, "marquer_envoyee", "2026-10-29");
    expect(resultat).toEqual({
      message: { statut: "envoyee", date_envoi: "2026-10-29", prochaine_relance: "2026-11-05" },
    });
  });

  it("replanifie sur le message initial quand une relance est envoyée", () => {
    const initial = prospection({ id: "p0", statut: "envoyee", nb_relances: 0, prochaine_relance: "2026-11-05" });
    const relance = prospection({ id: "p1", type: "relance", parent_id: "p0", statut: "valide" });
    expect(appliquerAction(relance, initial, "marquer_envoyee", "2026-11-06")).toEqual({
      message: { statut: "envoyee", date_envoi: "2026-11-06" },
      parent: { nb_relances: 1, prochaine_relance: "2026-11-20" },
    });
  });

  it("arrête les relances après la deuxième", () => {
    const initial = prospection({ id: "p0", statut: "envoyee", nb_relances: 1 });
    const relance = prospection({ id: "p2", type: "relance", parent_id: "p0", statut: "valide" });
    const resultat = appliquerAction(relance, initial, "marquer_envoyee", "2026-11-20");
    expect(resultat).toMatchObject({ parent: { nb_relances: 2, prochaine_relance: null } });
  });

  it("clôt le fil sur une réponse et abandonne les relances en cours", () => {
    const resultat = appliquerAction(prospection({ statut: "envoyee" }), null, "reponse_recue", "2026-11-01");
    expect(resultat).toEqual({
      message: { statut: "reponse_recue", prochaine_relance: null },
      abandonnerRelancesEnCours: true,
    });
  });

  it("répercute sur le message initial une réponse à une relance", () => {
    const initial = prospection({ id: "p0", statut: "envoyee" });
    const relance = prospection({ id: "p1", type: "relance", parent_id: "p0", statut: "envoyee" });
    expect(appliquerAction(relance, initial, "reponse_recue", "2026-11-08")).toEqual({
      message: { statut: "reponse_recue" },
      parent: { statut: "reponse_recue", prochaine_relance: null },
      abandonnerRelancesEnCours: true,
    });
  });

  it("refuse de clôturer un message jamais envoyé", () => {
    expect(appliquerAction(prospection(), null, "sans_suite", "2026-10-29")).toHaveProperty("erreur");
  });
});
