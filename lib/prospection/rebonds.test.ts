import { describe, expect, it } from "vitest";
import {
  analyserRebond,
  estAdresseRebond,
  extraireDestinatairesRebond,
  rapprocherRebond,
  type RebondBrut,
} from "@/lib/prospection/rebonds";
import type { EnvoiConnu } from "@/lib/prospection/reponses";

const MOI = "candidat@gmail.com";

const rebond = (surcharge: Partial<RebondBrut> = {}): RebondBrut => ({
  messageId: "<bounce1@googlemail.com>",
  date: new Date("2026-10-31T08:00:00Z"),
  sujet: "Delivery Status Notification (Failure)",
  destinatairesEnTete: [],
  texte: "",
  ...surcharge,
});

const envoi = (surcharge: Partial<EnvoiConnu> = {}): EnvoiConnu => ({
  id: "p1",
  parentId: null,
  smtpMessageId: null,
  emailContact: "marie.dupont@bel-group.com",
  dateEnvoi: "2026-10-29",
  ...surcharge,
});

describe("extraireDestinatairesRebond", () => {
  it("lit d'abord l'en-tête X-Failed-Recipients", () => {
    expect(extraireDestinatairesRebond({ destinatairesEnTete: ["Marie.Dupont@bel-group.com"], texte: "autre@x.fr" }, MOI)).toEqual([
      "marie.dupont@bel-group.com",
    ]);
  });

  it("lit la ligne Final-Recipient d'un rapport standard", () => {
    const texte = "Reporting-MTA: dns; mx.google.com\nFinal-Recipient: rfc822; marie.dupont@bel-group.com\nAction: failed";
    expect(extraireDestinatairesRebond({ destinatairesEnTete: [], texte }, MOI)).toEqual(["marie.dupont@bel-group.com"]);
  });

  it("à défaut, prend les adresses du début du message, sans la sienne ni celle du robot", () => {
    const texte = "Your message wasn't delivered to marie.dupont@bel-group.com because the address couldn't be found.\nmailer-daemon@googlemail.com candidat@gmail.com";
    expect(extraireDestinatairesRebond({ destinatairesEnTete: [], texte }, MOI)).toEqual(["marie.dupont@bel-group.com"]);
  });
});

describe("analyserRebond", () => {
  it("reconnaît un échec définitif (adresse inexistante)", () => {
    const a = analyserRebond(
      rebond({ texte: "Your message wasn't delivered to marie.dupont@bel-group.com because the address couldn't be found. 550 5.1.1" }),
      MOI,
    );
    expect(a.definitif).toBe(true);
    expect(a.destinataires).toEqual(["marie.dupont@bel-group.com"]);
  });

  it("reconnaît un message en français", () => {
    const a = analyserRebond(rebond({ sujet: "Notification d'état de la livraison (échec)", texte: "Adresse introuvable : x@bel-group.com" }), MOI);
    expect(a.definitif).toBe(true);
  });

  it("ne rend pas l'adresse invalide pour un simple retard de livraison", () => {
    const a = analyserRebond(
      rebond({ sujet: "Delivery Status Notification (Delay)", texte: "Delivery is delayed to x@bel-group.com. 4.4.1" }),
      MOI,
    );
    expect(a.definitif).toBe(false);
  });

  it("ne le fait pas non plus pour une boîte pleine", () => {
    const a = analyserRebond(rebond({ texte: "The recipient's mailbox is full. x@bel-group.com 552 5.2.2" }), MOI);
    expect(a.definitif).toBe(false);
  });
});

describe("rapprocherRebond", () => {
  const analyse = { destinataires: ["marie.dupont@bel-group.com"], definitif: true };

  it("rattache le rebond à l'envoi fait à cette adresse", () => {
    expect(rapprocherRebond(analyse, new Date("2026-10-31T08:00:00Z"), [envoi()])).toEqual({
      prospectionId: "p1",
      adresse: "marie.dupont@bel-group.com",
    });
  });

  it("préfère le message initial quand c'est une relance qui a rebondi, et l'envoi le plus récent", () => {
    const envois = [envoi({ id: "p-vieux", dateEnvoi: "2026-09-01" }), envoi({ id: "p-relance", parentId: "p-tete", dateEnvoi: "2026-10-29" })];
    expect(rapprocherRebond(analyse, new Date("2026-10-31T08:00:00Z"), envois)?.prospectionId).toBe("p-tete");
  });

  it("ignore un rebond sans rapport avec un envoi connu ou antérieur à l'envoi", () => {
    expect(rapprocherRebond({ destinataires: ["inconnu@autre.fr"], definitif: true }, new Date("2026-10-31T08:00:00Z"), [envoi()])).toBeNull();
    expect(rapprocherRebond(analyse, new Date("2026-10-20T08:00:00Z"), [envoi()])).toBeNull();
  });
});

describe("estAdresseRebond", () => {
  it("repère les robots de messagerie", () => {
    expect(estAdresseRebond("mailer-daemon@googlemail.com")).toBe(true);
    expect(estAdresseRebond("postmaster@bel-group.com")).toBe(true);
    expect(estAdresseRebond("marie@bel-group.com")).toBe(false);
  });
});
