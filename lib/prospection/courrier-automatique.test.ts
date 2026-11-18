import { describe, expect, it } from "vitest";
import {
  categorieAutomatique,
  debutDeCategorie,
  estLettreInformation,
  estMailRecruteur,
  estMailTemporaire,
  NOUVELLES_CATEGORIES_DEPUIS,
  RECRUTEURS_DEPUIS,
  trouverDossierLettres,
  trouverDossierRecruteurs,
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

describe("estLettreInformation : recrutement", () => {
  it("ne range pas en lettre d'information un mail d'une plateforme de recrutement ou d'évaluation", () => {
    for (const [expediteur, sujet] of [
      ["noreply@assessfirst.com", "Votre prochaine étape pour « Chef de produit » chez Société X"],
      ["noreply@assessfirst.com", "Merci d'avoir complété votre évaluation pour Société X"],
      ["noreply@assessfirst.com", "Vous avez partagé votre profil avec Société X"],
      ["no-reply@teamtailor-mail.com", "Nous aimerions vous garder dans notre bassin de talents"],
      ["x@y.example", "Invitation à l'évaluation en ligne"],
    ]) {
      expect(estLettreInformation({ expediteur, sujet, listeDesinscription: true }), `${expediteur} ${sujet}`).toBe(false);
    }
  });

  it("range toujours les vraies lettres d'information", () => {
    expect(estLettreInformation({ expediteur: "noreply@email.exemple.example", sujet: "4 nouveaux styles à essayer", listeDesinscription: true })).toBe(true);
    expect(estLettreInformation({ expediteur: "google-maps-noreply@exemple.example", sujet: "Votre avis a été vu 100 fois", listeDesinscription: true })).toBe(true);
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

describe("estMailRecruteur", () => {
  it("reconnaît une proposition d'un recruteur ou d'un cabinet", () => {
    for (const [expediteur, sujet] of [
      ["contact@cabinet-exemple.example", "Opportunité de poste : chef de projet"],
      ["hello@talent-exemple.example", "Job opportunity - Project Manager"],
      ["marie@recrutement-exemple.example", "Nous recrutons : un chargé de mission"],
    ]) {
      expect(estMailRecruteur({ expediteur, sujet }), sujet).toBe(true);
    }
  });

  it("ne touche pas aux réponses à tes candidatures", () => {
    for (const sujet of [
      "Votre candidature pour le poste de chef de projet",
      "Merci pour votre intérêt pour le poste de chef de projet",
      "Re: Opportunité de poste",
      "Suite à votre entretien pour le poste à pourvoir",
      "Your application for the open position",
    ]) {
      expect(estMailRecruteur({ expediteur: "recrutement@recrutement-exemple.example", sujet }), sujet).toBe(false);
    }
  });

  it("exige un expéditeur de recrutement, même avec un objet de proposition", () => {
    expect(estMailRecruteur({ expediteur: "ami@exemple.example", sujet: "Opportunité de poste" })).toBe(false);
  });
});

describe("dossier Recruteurs", () => {
  it("trouve le dossier avec ou sans emoji", () => {
    expect(trouverDossierRecruteurs([{ path: "Recruteurs", name: "Recruteurs" }])).toBe("Recruteurs");
    expect(trouverDossierRecruteurs([{ path: "Recruteurs 🤝", name: "Recruteurs 🤝" }])).toBe("Recruteurs 🤝");
    expect(trouverDossierRecruteurs([{ path: "Autre", name: "Autre" }])).toBeNull();
  });

  it("ne démarre le classement qu'à partir de la date de lancement", () => {
    const debut = debutDeCategorie("recruteur", 400, new Date("2026-11-20T10:00:00Z"));
    expect(debut.getTime()).toBe(new Date(`${RECRUTEURS_DEPUIS}T00:00:00+01:00`).getTime());
  });

  it("classe un mail de recruteur avant les lettres d'information", () => {
    expect(categorieAutomatique({ expediteur: "x@cabinet-exemple.example", sujet: "Opportunité de poste", listeDesinscription: true })).toBe("recruteur");
  });
});
