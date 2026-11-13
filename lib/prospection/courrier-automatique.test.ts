import { describe, expect, it } from "vitest";
import {
  categorieAutomatique,
  debutDeCategorie,
  estLettreInformation,
  estMailTemporaire,
  NOUVELLES_CATEGORIES_DEPUIS,
  trouverDossierLettres,
  trouverDossierTemporaires,
} from "./courrier-automatique";

describe("estMailTemporaire", () => {
  it("reconnaît réinitialisations de mot de passe et codes de vérification", () => {
    for (const sujet of [
      "Réinitialisation du mot de passe Société X",
      "Groupe Y - Réinitialisation de votre mot de passe",
      "Reset your password",
      "Password reset request",
      "Votre code de vérification",
      "Your verification code is 123456",
      "Code de connexion",
      "Your one-time code",
    ]) {
      expect(estMailTemporaire({ expediteur: "noreply@exemple.example", sujet }), sujet).toBe(true);
    }
  });

  it("ne range pas comme temporaire ce qui parle d'une candidature ou d'un achat", () => {
    expect(estMailTemporaire({ expediteur: "x@y.example", sujet: "Finalisez votre candidature : confirmez votre mot de passe" })).toBe(false);
    expect(estMailTemporaire({ expediteur: "x@y.example", sujet: "Votre facture et votre mot de passe" })).toBe(false);
    expect(estMailTemporaire({ expediteur: "x@y.example", sujet: "Bienvenue chez nous" })).toBe(false);
    expect(estMailTemporaire({ expediteur: "x@y.example", sujet: "Merci pour votre message" })).toBe(false);
  });
});

describe("estLettreInformation", () => {
  it("retient un mail avec lien de désinscription qui ne parle pas d'une candidature", () => {
    expect(estLettreInformation({ expediteur: "news@exemple.example", sujet: "Digital Talent News - exemple", listeDesinscription: true })).toBe(true);
    expect(estLettreInformation({ expediteur: "news@exemple.example", sujet: "Ensemble construisons une IA de confiance", listeDesinscription: true })).toBe(true);
  });

  it("ignore un mail sans lien de désinscription", () => {
    expect(estLettreInformation({ expediteur: "ami@exemple.example", sujet: "Salut", listeDesinscription: false })).toBe(false);
  });

  it("garde en boîte les mails de candidature, de facture ou de sécurité même avec un lien de désinscription", () => {
    for (const sujet of ["Thank you for your Application", "Votre candidature a bien été envoyée", "Votre facture", "Alerte de sécurité critique", "Votre entretien est demain"]) {
      expect(estLettreInformation({ expediteur: "x@y.example", sujet, listeDesinscription: true }), sujet).toBe(false);
    }
  });
});

describe("categorieAutomatique", () => {
  const base = { expediteur: "x@y.example", listeDesinscription: false };

  it("applique les catégories dans l'ordre : alerte, temporaire, lettre", () => {
    expect(categorieAutomatique({ expediteur: "d@match.indeed.com", sujet: "Chef de produit H/F", listeDesinscription: true })).toBe("alerte");
    expect(categorieAutomatique({ ...base, sujet: "Réinitialisation du mot de passe", listeDesinscription: true })).toBe("temporaire");
    expect(categorieAutomatique({ ...base, sujet: "Nos actualités", listeDesinscription: true })).toBe("lettre");
    expect(categorieAutomatique({ ...base, sujet: "Un message personnel" })).toBeNull();
  });
});

describe("debutDeCategorie", () => {
  it("ne remonte jamais avant la date de début des nouvelles catégories", () => {
    const debut = new Date(`${NOUVELLES_CATEGORIES_DEPUIS}T00:00:00+01:00`).getTime();
    expect(debutDeCategorie("lettre", 30, new Date("2026-11-14T10:00:00Z")).getTime()).toBe(debut);
    expect(debutDeCategorie("temporaire", 2, new Date("2026-11-14T10:00:00Z")).getTime()).toBe(debut);
  });
});

describe("dossiers", () => {
  const boites = [
    { path: "INBOX", name: "INBOX" },
    { path: "Mails temporaires", name: "Mails temporaires" },
    { path: "Lettres d'information", name: "Lettres d'information" },
  ];
  it("retrouve les dossiers par leur nom", () => {
    expect(trouverDossierTemporaires(boites)).toBe("Mails temporaires");
    expect(trouverDossierLettres(boites)).toBe("Lettres d'information");
    expect(trouverDossierTemporaires([{ path: "INBOX", name: "INBOX" }])).toBeNull();
  });
});
