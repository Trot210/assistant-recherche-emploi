import { describe, expect, it } from "vitest";
import { courrierARanger, debutDuTri, dossierPourNature, estCandidatPossible, TRI_DEPUIS, trouverDossier } from "./courrier-candidatures";

describe("estCandidatPossible", () => {
  it("retient les mails dont l'objet parle d'une candidature", () => {
    expect(estCandidatPossible({ expediteur: "rh@societe.example", sujet: "Merci de votre candidature pour Category Manager" })).toBe(true);
    expect(estCandidatPossible({ expediteur: "x@y.example", sujet: "Thank you for applying to Trade Marketing" })).toBe(true);
    expect(estCandidatPossible({ expediteur: "x@y.example", sujet: "Suite à votre entretien" })).toBe(true);
  });

  it("retient les mails des plateformes de recrutement, quel que soit l'objet", () => {
    expect(estCandidatPossible({ expediteur: "groupe@myworkday.com", sujet: "Mise à jour" })).toBe(true);
    expect(estCandidatPossible({ expediteur: "notification@smartrecruiters.com", sujet: "Retour" })).toBe(true);
  });

  it("écarte les alertes d'offres, newsletters et mails sans rapport", () => {
    expect(estCandidatPossible({ expediteur: "jobs@alertes.example", sujet: "Alerte emploi : 12 nouvelles offres" })).toBe(false);
    expect(estCandidatPossible({ expediteur: "ami@gmail.com", sujet: "On se voit samedi ?" })).toBe(false);
    expect(estCandidatPossible({ expediteur: "banque@exemple.example", sujet: "Votre relevé" })).toBe(false);
  });
});

describe("dossierPourNature", () => {
  it("accusé → attente, refus → refus, le reste reste en boîte de réception", () => {
    expect(dossierPourNature("accuse_reception")).toBe("attente");
    expect(dossierPourNature("refus")).toBe("refus");
    expect(dossierPourNature("entretien")).toBeNull();
    expect(dossierPourNature("autre")).toBeNull();
    expect(dossierPourNature("non_lie")).toBeNull();
  });
});

describe("trouverDossier", () => {
  const boites = [
    { path: "INBOX", name: "INBOX" },
    { path: "En attente re\u0301ponse \u23f3", name: "En attente re\u0301ponse \u23f3" },
    { path: "Refus \u274c", name: "Refus \u274c" },
    { path: "Prospection \ud83e\udd76", name: "Prospection \ud83e\udd76" },
  ];

  it("retrouve les dossiers par mot-clé malgré les accents et emojis", () => {
    expect(trouverDossier(boites, "attente")).toBe(boites[1].path);
    expect(trouverDossier(boites, "refus")).toBe(boites[2].path);
  });

  it("renvoie null s'il n'existe pas, et n'utilise jamais le dossier géré par le site", () => {
    expect(trouverDossier([{ path: "INBOX", name: "INBOX" }], "refus")).toBeNull();
    expect(trouverDossier([{ path: "Refus de prospection", name: "Refus de prospection" }], "refus")).toBeNull();
  });
});

describe("courrierARanger", () => {
  it("ne garde que les accusés et refus pas encore déplacés, avec leur identifiant", () => {
    const lignes = [
      { message_id_brut: "<a>", nature: "accuse_reception" as const, deplace_at: null, prospection_id: null },
      { message_id_brut: "<b>", nature: "refus" as const, deplace_at: null, prospection_id: "p1" },
      { message_id_brut: "<c>", nature: "refus" as const, deplace_at: "2026-11-03T10:00:00Z", prospection_id: null },
      { message_id_brut: "<d>", nature: "entretien" as const, deplace_at: null, prospection_id: null },
      { message_id_brut: null, nature: "refus" as const, deplace_at: null, prospection_id: null },
    ];
    expect(courrierARanger(lignes)).toEqual([
      { messageIdBrut: "<a>", nature: "accuse_reception", dossier: "attente", liaison: false },
      { messageIdBrut: "<b>", nature: "refus", dossier: "refus", liaison: true },
    ]);
  });
});

describe("debutDuTri", () => {
  it("ne remonte jamais avant la date de début du tri", () => {
    const debut = new Date(`${TRI_DEPUIS}T00:00:00+01:00`).getTime();
    expect(debutDuTri(120, new Date("2026-11-04T10:00:00Z")).getTime()).toBe(debut);
    expect(debutDuTri(3, new Date("2026-11-04T10:00:00Z")).getTime()).toBe(debut);
  });

  it("suit la fenêtre demandée une fois la date de début dépassée", () => {
    const maintenant = new Date("2026-11-20T10:00:00Z");
    expect(debutDuTri(3, maintenant).getTime()).toBe(maintenant.getTime() - 3 * 86_400_000);
  });
});
