import { describe, expect, it } from "vitest";
import {
  appliquerRegles,
  choisirReponse,
  dateRelance,
  lienMailto,
  objetReponse,
  passagesACompleter,
  recommandationAvecBrouillon,
  type ConseilReponse,
} from "./conseil-reponse";
import type { ReponseBrute } from "./reponses";

function conseil(partiel: Partial<ConseilReponse> = {}): ConseilReponse {
  return {
    categorie: "pas_de_besoin",
    resume: "Pas de besoin.",
    interlocuteur: { nom: null, poste: null, email: null },
    recommandation: "repondre_court",
    justification: "Courtoisie.",
    action_suggeree: null,
    relance_date: "2026-12-07",
    ne_plus_contacter: false,
    brouillon: { objet: "Re: test", corps: "Bonjour,\n\nMerci." },
    source: "message",
    avertissements: [],
    ...partiel,
  };
}

function reponse(id: string, jour: string): ReponseBrute {
  return {
    messageId: id,
    inReplyTo: null,
    references: [],
    fromEmail: "a@exemple.test",
    fromNom: null,
    date: new Date(`${jour}T10:00:00Z`),
    sujet: "Re: x",
    texte: "texte",
  };
}

describe("appliquerRegles", () => {
  it("garde le brouillon quand une réponse est conseillée", () => {
    expect(appliquerRegles(conseil()).brouillon).not.toBeNull();
  });

  it("retire le brouillon quand on conseille de ne pas répondre ou d'attendre", () => {
    expect(appliquerRegles(conseil({ recommandation: "ne_pas_repondre" })).brouillon).toBeNull();
    expect(appliquerRegles(conseil({ recommandation: "attendre" })).brouillon).toBeNull();
  });

  it("ne propose jamais de message à qui demande à ne plus être contacté", () => {
    const resultat = appliquerRegles(conseil({ ne_plus_contacter: true, recommandation: "repondre" }));
    expect(resultat.recommandation).toBe("ne_pas_repondre");
    expect(resultat.brouillon).toBeNull();
    expect(resultat.relance_date).toBeNull();
  });
});

describe("recommandationAvecBrouillon", () => {
  it("n'autorise un brouillon que pour les recommandations qui appellent un message", () => {
    expect(recommandationAvecBrouillon("repondre")).toBe(true);
    expect(recommandationAvecBrouillon("agir_d_abord")).toBe(true);
    expect(recommandationAvecBrouillon("attendre")).toBe(false);
    expect(recommandationAvecBrouillon("ne_pas_repondre")).toBe(false);
  });
});

describe("dateRelance", () => {
  it("ajoute le délai à la date du jour", () => {
    expect(dateRelance("2026-11-02", 35)).toBe("2026-12-07");
  });

  it("passe d'une année à l'autre", () => {
    expect(dateRelance("2026-12-20", 20)).toBe("2027-01-09");
  });

  it("refuse un délai absent, nul ou excessif", () => {
    expect(dateRelance("2026-11-02", null)).toBeNull();
    expect(dateRelance("2026-11-02", 0)).toBeNull();
    expect(dateRelance("2026-11-02", 400)).toBeNull();
    expect(dateRelance("2026-11-02", Number.NaN)).toBeNull();
  });
});

describe("choisirReponse", () => {
  const a = reponse("a", "2026-10-30");
  const b = reponse("b", "2026-11-02");

  it("renvoie null sans réponse", () => {
    expect(choisirReponse([], { reponseDate: null, messageIdsConnus: [] })).toBeNull();
  });

  it("préfère le message déjà associé à la candidature", () => {
    expect(choisirReponse([a, b], { reponseDate: "2026-11-02", messageIdsConnus: ["a"] })?.messageId).toBe("a");
  });

  it("prend le plus proche de la date de réponse enregistrée", () => {
    expect(choisirReponse([a, b], { reponseDate: "2026-10-31", messageIdsConnus: [] })?.messageId).toBe("a");
    expect(choisirReponse([a, b], { reponseDate: "2026-11-02", messageIdsConnus: [] })?.messageId).toBe("b");
  });

  it("prend le plus récent sans date enregistrée", () => {
    expect(choisirReponse([a, b], { reponseDate: null, messageIdsConnus: [] })?.messageId).toBe("b");
  });
});

describe("objetReponse", () => {
  it("préfixe l'objet reçu", () => {
    expect(objetReponse("Candidature spontanée", "x")).toBe("Re: Candidature spontanée");
  });

  it("n'empile pas les « Re: »", () => {
    expect(objetReponse("RE: Candidature", "x")).toBe("RE: Candidature");
  });

  it("retombe sur l'objet envoyé", () => {
    expect(objetReponse("", "Candidature")).toBe("Re: Candidature");
  });
});

describe("lienMailto", () => {
  it("encode l'objet et le corps, avec des retours à la ligne mail", () => {
    const lien = lienMailto({ destinataire: "a@exemple.test", objet: "Re: Café & thé", corps: "Bonjour,\n\nMerci" });
    expect(lien.startsWith("mailto:a%40exemple.test?subject=")).toBe(true);
    expect(lien).toContain("Re%3A%20Caf%C3%A9%20%26%20th%C3%A9");
    expect(lien).toContain("Bonjour%2C%0D%0A%0D%0AMerci");
  });
});

describe("passagesACompleter", () => {
  it("repère les passages entre crochets", () => {
    expect(passagesACompleter("J'ai postulé à [titre de l'offre] hier.")).toEqual(["titre de l'offre"]);
  });

  it("ne trouve rien dans un texte complet", () => {
    expect(passagesACompleter("Merci pour votre retour.")).toEqual([]);
  });
});
