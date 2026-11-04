import { describe, expect, it } from "vitest";
import { ALERTES_DEPUIS, debutDesAlertes, estAlerteEmploi, trouverDossierAlertes } from "./alertes-emploi";

describe("estAlerteEmploi", () => {
  it("reconnaît les alertes des sites d'annonces", () => {
    expect(estAlerteEmploi({ expediteur: "alerte@emails.hellowork.com", sujet: "Votre alerte Category manager - Île-de-France" })).toBe(true);
    expect(estAlerteEmploi({ expediteur: "donotreply@match.indeed.com", sujet: "Acheteur Confirmé H/F" })).toBe(true);
    expect(estAlerteEmploi({ expediteur: "news@mail.michaelpage.fr", sujet: "Nouveaux postes" })).toBe(true);
    expect(estAlerteEmploi({ expediteur: "ALERTE@Meteojob.com", sujet: "Offres pour vous" })).toBe(true);
  });

  it("laisse en boîte de réception les mails de candidature, même du même site", () => {
    expect(estAlerteEmploi({ expediteur: "donotreply@match.indeed.com", sujet: "Candidatures via Indeed : Chef de Produit" })).toBe(false);
    expect(estAlerteEmploi({ expediteur: "alerte@emails.hellowork.com", sujet: "Votre candidature a bien été envoyée" })).toBe(false);
    expect(estAlerteEmploi({ expediteur: "reply@reply.hellowork.com", sujet: "Votre alerte" })).toBe(false);
  });

  it("ignore les autres expéditeurs", () => {
    expect(estAlerteEmploi({ expediteur: "ami@gmail.com", sujet: "Votre alerte" })).toBe(false);
    expect(estAlerteEmploi({ expediteur: "x@faux-indeed.com.evil.example", sujet: "Alerte" })).toBe(false);
  });
});

describe("debutDesAlertes", () => {
  it("ne remonte jamais avant la date de début", () => {
    const debut = new Date(`${ALERTES_DEPUIS}T00:00:00+01:00`).getTime();
    expect(debutDesAlertes(30, new Date("2026-11-05T10:00:00Z")).getTime()).toBe(debut);
  });
});

describe("trouverDossierAlertes", () => {
  it("retrouve le dossier par son nom", () => {
    expect(trouverDossierAlertes([{ path: "INBOX", name: "INBOX" }, { path: "Alertes emploi", name: "Alertes emploi" }])).toBe("Alertes emploi");
    expect(trouverDossierAlertes([{ path: "INBOX", name: "INBOX" }])).toBeNull();
  });
});
