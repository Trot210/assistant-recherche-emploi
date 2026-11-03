import { describe, expect, it } from "vitest";
import { choisirRecapsAClasser, choisirRecusAClasser } from "./classement-courrier";
import { estSujetRecap } from "./recap";
import type { EnvoiConnu, ReponseBrute } from "./reponses";

const envois: EnvoiConnu[] = [
  { id: "p1", parentId: null, smtpMessageId: "<orig-1@gmail.com>", emailContact: "contact@societe-a.example", dateEnvoi: "2026-10-30" },
  { id: "p2", parentId: null, smtpMessageId: "<orig-2@gmail.com>", emailContact: "rh@societe-b.example", dateEnvoi: "2026-10-30" },
];

function recu(id: string, surcharge: Partial<ReponseBrute> = {}): ReponseBrute {
  return {
    messageId: id,
    messageIdBrut: `<${id.toUpperCase()}>`,
    inReplyTo: null,
    references: [],
    fromEmail: "inconnu@autre.example",
    fromNom: null,
    date: new Date("2026-11-02T10:00:00Z"),
    sujet: "Sujet",
    texte: "",
    ...surcharge,
  };
}

const MOI = "moi@gmail.com";

describe("choisirRecusAClasser", () => {
  it("retient une réponse directe, une réponse du contact et un collègue du même domaine", () => {
    const entrants = [
      recu("m1", { inReplyTo: "orig-1@gmail.com" }),
      recu("m2", { fromEmail: "contact@societe-a.example" }),
      recu("m3", { fromEmail: "autre.personne@societe-b.example" }),
    ];
    const r = choisirRecusAClasser(entrants, envois, MOI);
    expect(r.map((x) => [x.message.messageId, x.prospectionId])).toEqual([
      ["m1", "p1"],
      ["m2", "p1"],
      ["m3", "p2"],
    ]);
  });

  it("laisse de côté tout ce qui ne vient pas de la prospection", () => {
    const entrants = [
      recu("m1", { fromEmail: "newsletter@commerce.example" }),
      recu("m2", { fromEmail: "ami@gmail.com" }),
      recu("m3", { fromEmail: "banque@exemple-banque.example", sujet: "Votre relevé" }),
    ];
    expect(choisirRecusAClasser(entrants, envois, MOI)).toEqual([]);
  });

  it("ne prend jamais un message envoyé par l'utilisateur lui-même", () => {
    const entrants = [recu("m1", { fromEmail: "MOI@gmail.com", inReplyTo: "orig-1@gmail.com" })];
    expect(choisirRecusAClasser(entrants, envois, MOI)).toEqual([]);
  });

  it("ignore un message sans identifiant exploitable et les doublons", () => {
    const entrants = [
      recu("m1", { fromEmail: "contact@societe-a.example", messageIdBrut: undefined }),
      recu("m2", { fromEmail: "contact@societe-a.example" }),
      recu("m2", { fromEmail: "contact@societe-a.example" }),
    ];
    expect(choisirRecusAClasser(entrants, envois, MOI).map((x) => x.message.messageId)).toEqual(["m2"]);
  });

  it("repère un rapport de non-distribution qui cite notre message", () => {
    const entrants = [recu("m1", { fromEmail: "mailer-daemon@googlemail.com", references: ["orig-2@gmail.com"] })];
    expect(choisirRecusAClasser(entrants, envois, MOI)[0]?.prospectionId).toBe("p2");
  });
});

describe("estSujetRecap / choisirRecapsAClasser", () => {
  it("reconnaît l'objet du récapitulatif du matin, au singulier comme au pluriel", () => {
    expect(estSujetRecap("Le Rayon — 11 choses à faire aujourd'hui")).toBe(true);
    expect(estSujetRecap("Le Rayon — 1 chose à faire aujourd'hui")).toBe(true);
    expect(estSujetRecap("Le Rayon — nouveautés")).toBe(false);
    expect(estSujetRecap("Re: Candidature spontanée")).toBe(false);
  });

  it("ne retient que les récapitulatifs envoyés par soi-même, sans doublon", () => {
    const sujet = "Le Rayon — 4 choses à faire aujourd'hui";
    const entrants = [
      recu("r1", { fromEmail: "MOI@gmail.com", sujet }),
      recu("r1", { fromEmail: "moi@gmail.com", sujet }),
      recu("r2", { fromEmail: "moi@gmail.com", sujet: "Facture" }),
      recu("r3", { fromEmail: "inconnu@autre.example", sujet }),
      recu("r4", { fromEmail: "moi@gmail.com", sujet, messageIdBrut: undefined }),
    ];
    expect(choisirRecapsAClasser(entrants, MOI).map((m) => m.messageId)).toEqual(["r1"]);
  });
});
