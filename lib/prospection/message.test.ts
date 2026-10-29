import { describe, expect, it } from "vitest";
import { assemblerMessage, offrePourProspection } from "@/lib/prospection/message";
import type { Entreprise } from "@/types/prospection";

const candidat = { nom: "Lucien Tamba", telephone: "06 00 00 00 00", email: "lucien@exemple.fr" };

describe("assemblerMessage", () => {
  it("ajoute appel, signature du profil et mention de désinscription", () => {
    const message = assemblerMessage({ corps: "Je vise un poste de Category Manager.", contactNom: "Marie Dupont", candidat });
    expect(message.startsWith("Bonjour Marie Dupont,\n\n")).toBe(true);
    expect(message).toContain("Cordialement,\n\nLucien Tamba\n06 00 00 00 00\nlucien@exemple.fr");
    expect(message).toMatch(/supprimerai vos coordonnées\.$/);
  });

  it("reste neutre sans contact et saute les champs de signature manquants", () => {
    const message = assemblerMessage({ corps: "Corps", contactNom: null, candidat: { nom: "Lucien Tamba" } });
    expect(message.startsWith("Bonjour,\n\n")).toBe(true);
    expect(message).toContain("Cordialement,\n\nLucien Tamba\n\n");
  });
});

describe("offrePourProspection", () => {
  it("ne décrit l'entreprise qu'avec des faits connus", () => {
    const entreprise = {
      id: "e1",
      user_id: "u1",
      siren: "123456789",
      nom: "Chocolats Martin",
      secteur: "Agroalimentaire",
      tranche_effectif: "32",
      commune: "SAINT-OUEN",
      notes: "Lancement d'une gamme bio en septembre",
    } as Entreprise;

    const offre = offrePourProspection(entreprise, "Trade Marketing");
    expect(offre.titre).toBe("Trade Marketing");
    expect(offre.entreprise).toBe("Chocolats Martin");
    expect(offre.description).toContain("Candidature spontanée");
    expect(offre.description).toContain("250-499 salariés");
    expect(offre.description).toContain("gamme bio");
  });

  it("omet les faits absents au lieu de les inventer", () => {
    const entreprise = { id: "e1", user_id: "u1", siren: "1", nom: "X" } as Entreprise;
    const offre = offrePourProspection(entreprise, "Acheteur");
    expect(offre.description).toBe("Candidature spontanée : aucune offre n'est publiée.");
  });
});
