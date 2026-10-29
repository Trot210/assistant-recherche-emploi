import { describe, expect, it } from "vitest";
import {
  critereRecherche,
  estExpediteurAutomatique,
  extraireUrls,
  listerIdsMessages,
  nettoyerCorps,
  normaliserIdMessage,
  rapprocher,
  type EnvoiConnu,
  type ReponseBrute,
} from "@/lib/prospection/reponses";

const envoi = (surcharge: Partial<EnvoiConnu> = {}): EnvoiConnu => ({
  id: "p-initial",
  parentId: null,
  smtpMessageId: "<abc123@gmail.com>",
  emailContact: "marie.dupont@bel-group.com",
  dateEnvoi: "2026-10-29",
  ...surcharge,
});

const reponse = (surcharge: Partial<ReponseBrute> = {}): ReponseBrute => ({
  messageId: "<rep1@bel-group.com>",
  inReplyTo: null,
  references: [],
  fromEmail: "marie.dupont@bel-group.com",
  fromNom: "Marie Dupont",
  date: new Date("2026-10-30T09:00:00Z"),
  sujet: "Re: Candidature spontanée",
  texte: "Merci",
  ...surcharge,
});

describe("identifiants de messages", () => {
  it("ignore chevrons, espaces et casse", () => {
    expect(normaliserIdMessage(" <ABC@x.fr> ")).toBe("abc@x.fr");
    expect(normaliserIdMessage("")).toBeNull();
    expect(listerIdsMessages("<a@x.fr>  <B@y.fr>")).toEqual(["a@x.fr", "b@y.fr"]);
    expect(listerIdsMessages(["<a@x.fr>"])).toEqual(["a@x.fr"]);
    expect(listerIdsMessages(undefined)).toEqual([]);
  });
});

describe("rapprocher", () => {
  it("reconnaît une réponse directe par l'identifiant cité dans In-Reply-To", () => {
    expect(rapprocher(reponse({ inReplyTo: "<ABC123@gmail.com>", fromEmail: "autre@bel-group.com" }), [envoi()])).toEqual({
      prospectionId: "p-initial",
      confiance: "certaine",
    });
  });

  it("reconnaît une réponse directe par References, et rattache une relance à son message initial", () => {
    const relance = envoi({ id: "p-relance", parentId: "p-initial", smtpMessageId: "<rel456@gmail.com>", dateEnvoi: "2026-11-05" });
    const r = reponse({ references: ["abc123@gmail.com", "rel456@gmail.com"], date: new Date("2026-11-06T10:00:00Z") });
    expect(rapprocher(r, [envoi(), relance])).toEqual({ prospectionId: "p-initial", confiance: "certaine" });
  });

  it("à défaut, retient la même adresse comme « probable », sur l'envoi le plus récent avant la réponse", () => {
    const ancien = envoi({ id: "p-1", smtpMessageId: null, dateEnvoi: "2026-10-01" });
    const recent = envoi({ id: "p-2", smtpMessageId: null, dateEnvoi: "2026-10-20" });
    const futur = envoi({ id: "p-3", smtpMessageId: null, dateEnvoi: "2026-12-01" });
    expect(rapprocher(reponse(), [ancien, recent, futur])).toEqual({ prospectionId: "p-2", confiance: "probable" });
  });

  it("propose « possible » quand quelqu'un d'autre de la même entreprise répond", () => {
    expect(rapprocher(reponse({ fromEmail: "recrutement@bel-group.com" }), [envoi({ smtpMessageId: null })])).toEqual({
      prospectionId: "p-initial",
      confiance: "possible",
    });
  });

  it("ne rapproche jamais sur un domaine de messagerie grand public", () => {
    const e = envoi({ emailContact: "candidat@gmail.com", smtpMessageId: null });
    expect(rapprocher(reponse({ fromEmail: "inconnu@gmail.com" }), [e])).toBeNull();
  });

  it("ne rapproche pas une réponse arrivée avant l'envoi, ni une entreprise inconnue", () => {
    expect(rapprocher(reponse({ date: new Date("2026-10-20T09:00:00Z") }), [envoi({ smtpMessageId: null })])).toBeNull();
    expect(rapprocher(reponse({ fromEmail: "x@autre-entreprise.com" }), [envoi({ smtpMessageId: null })])).toBeNull();
  });
});

describe("critereRecherche", () => {
  it("cherche le domaine d'une entreprise, mais seulement l'adresse exacte en messagerie grand public", () => {
    expect(critereRecherche("Marie@Bel-Group.com")).toEqual({ type: "domaine", valeur: "bel-group.com" });
    expect(critereRecherche("Candidat@Gmail.com")).toEqual({ type: "adresse", valeur: "candidat@gmail.com" });
    expect(critereRecherche("pas-un-email")).toBeNull();
  });
});

describe("nettoyerCorps", () => {
  it("coupe à la citation du message d'origine, en français et en anglais", () => {
    const fr = "Bonjour,\nMerci pour votre message.\nBien cordialement\n\nLe jeu. 30 oct. 2026 à 09:00, Prénom Nom <candidat@exemple.fr> a écrit :\n> Bonjour";
    expect(nettoyerCorps(fr)).toBe("Bonjour, Merci pour votre message. Bien cordialement");
    expect(nettoyerCorps("Thanks!\nOn Thu, Oct 30, 2026 at 9:00 AM Candidate <candidat@exemple.fr> wrote:\n> Hello")).toBe("Thanks!");
  });

  it("borne la longueur et supprime les retours à la ligne", () => {
    const long = "mot ".repeat(400);
    const propre = nettoyerCorps(long, 100);
    expect(propre.length).toBeLessThanOrEqual(100);
    expect(propre.endsWith("…")).toBe(true);
    expect(propre).not.toContain("\n");
  });
});

describe("extraireUrls", () => {
  it("ne retient que les liens écrits dans le message, sans ponctuation finale ni doublon", () => {
    const texte = "Consultez https://www.groupe-bel.com/talents/. Aussi (https://www.linkedin.com/company/bel/jobs), et https://www.groupe-bel.com/talents/.";
    expect(extraireUrls(texte)).toEqual(["https://www.groupe-bel.com/talents/", "https://www.linkedin.com/company/bel/jobs"]);
    expect(extraireUrls("aucun lien")).toEqual([]);
  });
});

describe("estExpediteurAutomatique", () => {
  it("repère les expéditeurs qui ne sont pas des personnes", () => {
    expect(estExpediteurAutomatique("mailer-daemon@googlemail.com")).toBe(true);
    expect(estExpediteurAutomatique("noreply@bel-group.com")).toBe(true);
    expect(estExpediteurAutomatique("marie.dupont@bel-group.com")).toBe(false);
  });
});
