import { describe, expect, it } from "vitest";
import type { Prospection } from "@/types/prospection";
import { appliquerSuivi, idSuivi, libelleSuivi, STATUTS_SUIVI, validerChampsSuivi } from "@/lib/prospection/suivi";

function prospection(surcharge: Partial<Prospection> = {}): Prospection {
  return {
    id: "p1",
    user_id: "u1",
    entreprise_id: "e1",
    contact_id: null,
    parent_id: null,
    type: "initial",
    poste_vise: "Category Manager",
    objet: "Objet",
    corps: "Corps",
    statut: "envoyee",
    avertissements: [],
    cv_path: null,
    gmail_draft_id: null,
    gmail_message_id: null,
    gmail_thread_id: null,
    langue: "fr",
    smtp_message_id: "<abc@gmail.com>",
    date_envoi: "2026-10-29",
    nb_relances: 0,
    prochaine_relance: "2026-11-05",
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

describe("statut de suivi affiché", () => {
  it("se déduit du statut de base et du type de réponse", () => {
    expect(idSuivi(prospection())).toBe("envoye");
    expect(idSuivi(prospection({ statut: "reponse_recue" }))).toBe("reponse");
    expect(idSuivi(prospection({ statut: "reponse_recue", reponse_type: "offre" }))).toBe("offre");
    expect(idSuivi(prospection({ statut: "sans_suite" }))).toBe("sans_suite");
    expect(libelleSuivi(prospection({ statut: "reponse_recue", reponse_type: "refus" }))).toBe("Refus");
  });

  it("garde un seul identifiant par libellé et ne définit que des statuts connus de la base", () => {
    const ids = STATUTS_SUIVI.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STATUTS_SUIVI) expect(["envoyee", "reponse_recue", "sans_suite"]).toContain(s.statut);
  });
});

describe("appliquerSuivi", () => {
  it("clôt le fil au premier retour : statut, type, date, relance annulée, brouillons abandonnés", () => {
    const resultat = appliquerSuivi(prospection(), "offre", "2026-11-02");
    expect(resultat).toEqual({
      patch: {
        statut: "reponse_recue",
        prochaine_relance: null,
        reponse_type: "offre",
        reponse_date: "2026-11-02",
      },
      abandonnerRelancesEnCours: true,
    });
  });

  it("utilise la date de réponse fournie plutôt que celle du jour", () => {
    const resultat = appliquerSuivi(prospection(), "refus", "2026-11-10", "2026-11-04");
    expect(resultat).toMatchObject({ patch: { reponse_date: "2026-11-04" } });
  });

  it("passe en « sans suite » sans date de réponse", () => {
    const resultat = appliquerSuivi(prospection(), "sans_suite", "2026-11-20");
    expect(resultat).toMatchObject({
      patch: { statut: "sans_suite", reponse_type: null, reponse_date: null, prochaine_relance: null },
      abandonnerRelancesEnCours: true,
    });
  });

  it("change seulement le type entre deux statuts déjà clos, en gardant la date de réponse", () => {
    const deja = prospection({ statut: "reponse_recue", reponse_type: "autre", reponse_date: "2026-11-02", prochaine_relance: null });
    expect(appliquerSuivi(deja, "entretien", "2026-11-09")).toEqual({
      patch: { statut: "reponse_recue", reponse_type: "entretien", reponse_date: "2026-11-02" },
      abandonnerRelancesEnCours: false,
    });
  });

  it("ne fait rien quand le statut est déjà celui demandé", () => {
    expect(appliquerSuivi(prospection(), "envoye", "2026-11-02")).toEqual({ patch: {}, abandonnerRelancesEnCours: false });
  });

  it("refuse de revenir à « envoyé » une fois le fil clos", () => {
    const deja = prospection({ statut: "reponse_recue", reponse_type: "refus", prochaine_relance: null });
    expect(appliquerSuivi(deja, "envoye", "2026-11-09")).toHaveProperty("erreur");
  });

  it("refuse un message qui n'est pas un message initial envoyé", () => {
    expect(appliquerSuivi(prospection({ type: "relance" }), "refus", "2026-11-02")).toHaveProperty("erreur");
    expect(appliquerSuivi(prospection({ statut: "a_valider", date_envoi: null }), "refus", "2026-11-02")).toHaveProperty("erreur");
  });
});

describe("validerChampsSuivi", () => {
  it("accepte des champs valides et n'en retourne que ce qui est envoyé", () => {
    expect(validerChampsSuivi({ commentaire: "  Relancer après le salon  " })).toEqual({
      champs: { commentaire: "Relancer après le salon" },
    });
    expect(validerChampsSuivi({ prochaine_action: "Postuler sur le site carrières", prochaine_action_date: "2026-11-12" })).toEqual({
      champs: { prochaine_action: "Postuler sur le site carrières", prochaine_action_date: "2026-11-12" },
    });
  });

  it("efface un champ vidé", () => {
    expect(validerChampsSuivi({ commentaire: "", prochaine_action_date: null })).toEqual({
      champs: { commentaire: null, prochaine_action_date: null },
    });
  });

  it("refuse les dates impossibles, les mauvais types et les textes trop longs", () => {
    expect(validerChampsSuivi({ prochaine_action_date: "2026-02-31" })).toHaveProperty("erreur");
    expect(validerChampsSuivi({ prochaine_action_date: "12/11/2026" })).toHaveProperty("erreur");
    expect(validerChampsSuivi({ commentaire: 42 })).toHaveProperty("erreur");
    expect(validerChampsSuivi({ prochaine_action: "x".repeat(301) })).toHaveProperty("erreur");
    expect(validerChampsSuivi(null)).toHaveProperty("erreur");
  });
});
