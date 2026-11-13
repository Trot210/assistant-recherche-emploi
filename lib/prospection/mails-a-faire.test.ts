import { describe, expect, it } from "vitest";
import { entretiensRecents, mailsAFaire, nomExpediteur, type LigneCourrierBrute } from "./mails-a-faire";

const maintenant = new Date("2026-11-20T09:00:00Z");

function ligne(extra: Partial<LigneCourrierBrute>): LigneCourrierBrute {
  return { nature: "autre", expediteur: "Société Exemple <rh@societe.example>", sujet: "Finalisez votre candidature", resume: "", date_mail: "2026-11-18T10:00:00Z", ...extra };
}

describe("nomExpediteur", () => {
  it("garde le nom affiché, à défaut le domaine", () => {
    expect(nomExpediteur("Société Exemple <rh@societe.example>")).toBe("Société Exemple");
    expect(nomExpediteur('"Équipe RH" <rh@societe.example>')).toBe("Équipe RH");
    expect(nomExpediteur("<rh@societe.example>")).toBe("societe.example");
  });
});

describe("mailsAFaire", () => {
  it("ne garde que les mails qui demandent une action et ne sont pas faits", () => {
    const lignes = [
      ligne({ action_requise: true, action_texte: "Finaliser la candidature", action_lien: "https://societe.example/candidature" }),
      ligne({ action_requise: true, action_texte: "Envoyer un document", action_faite_at: "2026-11-19T08:00:00Z" }),
      ligne({ action_requise: false }),
      ligne({ nature: "entretien", action_requise: false }),
    ];
    const resultat = mailsAFaire(lignes, maintenant);
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({ expediteur: "Société Exemple", action: "Finaliser la candidature", lien: "https://societe.example/candidature" });
  });

  it("n'expose jamais un lien qui n'est pas en https", () => {
    const resultat = mailsAFaire([ligne({ action_requise: true, action_texte: "Répondre", action_lien: "javascript:alert(1)" })], maintenant);
    expect(resultat[0].lien).toBeNull();
    expect(mailsAFaire([ligne({ action_requise: true, action_texte: "Répondre", action_lien: "http://societe.example" })], maintenant)[0].lien).toBeNull();
  });

  it("oublie les mails de plus de 30 jours et met les plus récents en premier", () => {
    const resultat = mailsAFaire(
      [
        ligne({ action_requise: true, action_texte: "Ancien", date_mail: "2026-10-01T10:00:00Z" }),
        ligne({ action_requise: true, action_texte: "Vieux", date_mail: "2026-11-05T10:00:00Z" }),
        ligne({ action_requise: true, action_texte: "Récent", date_mail: "2026-11-19T10:00:00Z" }),
      ],
      maintenant,
    );
    expect(resultat.map((m) => m.action)).toEqual(["Récent", "Vieux"]);
  });
});

describe("entretiensRecents", () => {
  const lignes = [
    ligne({ nature: "entretien", sujet: "Invitation à un entretien", date_mail: "2026-11-19T10:00:00Z", resume: "Entretien proposé jeudi" }),
    ligne({ nature: "entretien", sujet: "Ancien entretien", date_mail: "2026-10-15T10:00:00Z" }),
    ligne({ nature: "refus" }),
  ];

  it("garde les invitations des 21 derniers jours", () => {
    expect(entretiensRecents(lignes, maintenant).map((e) => e.sujet)).toEqual(["Invitation à un entretien"]);
  });

  it("peut se limiter aux toutes récentes pour le récapitulatif du matin", () => {
    expect(entretiensRecents(lignes, new Date("2026-11-22T09:00:00Z"), 2)).toHaveLength(0);
    expect(entretiensRecents(lignes, new Date("2026-11-20T09:00:00Z"), 3)).toHaveLength(1);
  });
});
