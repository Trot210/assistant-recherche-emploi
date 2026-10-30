import { describe, expect, it } from "vitest";
import {
  blocageContact,
  blocageEntreprise,
  estPolitique,
  libellePolitique,
  politiqueProposee,
  premierBlocage,
} from "@/lib/prospection/politique";

describe("blocageEntreprise", () => {
  it("interdit d'écrire à une entreprise marquée « ne plus contacter »", () => {
    expect(blocageEntreprise({ nom: "Bel", politique_candidature: "ne_pas_recontacter" })?.niveau).toBe("interdit");
  });

  it("avertit seulement quand l'entreprise ne conserve pas les spontanées ou passe par son portail", () => {
    expect(blocageEntreprise({ nom: "Opella", politique_candidature: "non_conservees" })?.niveau).toBe("avertissement");
    expect(blocageEntreprise({ nom: "Opella", politique_candidature: "portail_uniquement" })?.niveau).toBe("avertissement");
  });

  it("ne bloque rien sans politique ou si les spontanées sont acceptées", () => {
    expect(blocageEntreprise({ nom: "Bel", politique_candidature: null })).toBeNull();
    expect(blocageEntreprise({ nom: "Bel", politique_candidature: "acceptees" })).toBeNull();
  });
});

describe("blocageContact", () => {
  it("interdit les adresses invalides ou exclues, jamais les adresses saines", () => {
    expect(blocageContact({ nom: "Marie", email_statut: "invalide" })?.niveau).toBe("interdit");
    expect(blocageContact({ nom: "Marie", email_statut: "ne_plus_contacter" })?.raison).toContain("ne plus être contacté");
    expect(blocageContact({ nom: "Marie", email_statut: "ok" })).toBeNull();
    expect(blocageContact(null)).toBeNull();
  });
});

describe("premierBlocage", () => {
  it("retient le blocage interdit avant un simple avertissement", () => {
    const b = premierBlocage({ nom: "Opella", politique_candidature: "non_conservees" }, { nom: "Marie", email_statut: "invalide" });
    expect(b?.niveau).toBe("interdit");
    expect(b?.raison).toContain("Marie");
  });

  it("rend l'avertissement quand il est seul, et rien quand tout va bien", () => {
    expect(premierBlocage({ nom: "Opella", politique_candidature: "non_conservees" }, null)?.niveau).toBe("avertissement");
    expect(premierBlocage({ nom: "Bel", politique_candidature: null }, { nom: "Marie", email_statut: "ok" })).toBeNull();
  });
});

describe("politiques", () => {
  it("reconnaît les valeurs autorisées et leurs libellés", () => {
    expect(estPolitique("non_conservees")).toBe(true);
    expect(estPolitique("autre")).toBe(false);
    expect(libellePolitique("ne_pas_recontacter")).toBe("Ne plus contacter");
    expect(libellePolitique(null)).toBeNull();
  });

  it("ne propose une politique que pour une réponse « CV non conservé »", () => {
    expect(politiqueProposee("cv_non_conserve")).toBe("non_conservees");
    expect(politiqueProposee("refus")).toBeNull();
    expect(politiqueProposee("offre")).toBeNull();
  });
});
