import { describe, expect, it } from "vitest";
import { assemblerMessage, offrePourProspection, sourceAdresse } from "@/lib/prospection/message";
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

describe("assemblerMessage en anglais", () => {
  it("salue par le prénom et utilise la formule et la mention anglaises", () => {
    const message = assemblerMessage({ corps: "Body", contactNom: "Anna Schmidt", candidat, langue: "en" });
    expect(message.startsWith("Hello Anna,\n\n")).toBe(true);
    expect(message).toContain("Kind regards,");
    expect(message).toMatch(/delete your details\.$/);
    expect(message).not.toContain("Cordialement");
  });

  it("reste neutre sans contact", () => {
    expect(assemblerMessage({ corps: "Body", contactNom: null, candidat, langue: "en" }).startsWith("Hello,\n\n")).toBe(true);
  });
});

describe("provenance de l'adresse", () => {
  it("place la phrase de provenance avant la mention de désinscription, en français et en anglais", () => {
    const fr = assemblerMessage({ corps: "Corps", candidat, source: "Votre adresse figure dans l'annuaire professionnel Hunter.io." });
    expect(fr).toMatch(/Hunter\.io\. Si vous préférez/);
    const en = assemblerMessage({ corps: "Body", candidat, langue: "en", source: "Your address is published on your company's website." });
    expect(en).toMatch(/website\. If you'd rather/);
  });

  it("choisit la phrase selon l'origine du contact, avec des phrases correctes en français", () => {
    expect(sourceAdresse({ origine: "hunter", source_email: null }, "fr")).toBe("Votre adresse figure dans l'annuaire professionnel Hunter.io.");
    expect(sourceAdresse({ origine: "page_publique", source_email: null }, "fr")).toBe("Votre adresse est publiée sur le site de votre entreprise.");
    expect(sourceAdresse({ origine: "page_publique", source_email: null }, "en")).toBe("Your address is published on your company's website.");
    expect(sourceAdresse({ origine: "devine", source_email: null }, "fr")).toBe("Votre adresse a été déduite du format des adresses de votre entreprise.");
    expect(sourceAdresse({ origine: "manuel", source_email: " site de l'entreprise " }, "fr")).toBe("Votre adresse provient de : site de l'entreprise.");
    expect(sourceAdresse({ origine: "manuel", source_email: "x".repeat(81) }, "fr")).toBeNull();
    expect(sourceAdresse(null, "fr")).toBeNull();
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
