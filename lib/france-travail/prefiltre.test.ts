import { describe, expect, it } from "vitest";
import { estOffreHorsCible } from "./prefiltre";

describe("estOffreHorsCible", () => {
  it("écarte les métiers clairement hors cible (titres réels du catalogue)", () => {
    const horsCible = [
      "Conseiller de clientèle particuliers en agence bancaire (H/F)",
      "Agent commercial / Agente commerciale en immobilier (H/F)",
      "EMPLOYE COMMERCIAL - FRUITS & LEGUMES (H/F)",
      "Vendeur polyvalent - CDI 35h (H/F)",
      "Auxiliaire de vie mandataire H/F",
      "Technicien d'Inspection Electricité H/F",
      "Cuisinier (H/F)",
      "Conseiller / Conseillère en assurances (H/F)",
      "Chargé de clientèle particuliers en agence (H/F)",
    ];
    for (const titre of horsCible) expect(estOffreHorsCible(titre), titre).toBe(true);
  });

  it("garde les intitulés ciblés par le profil", () => {
    const pertinents = [
      "Category Manager Gaming & High-Tech (H/F)",
      "Key Account Manager OTA & Ventes Flash H/F",
      "Acheteur chef de produit distribution (H/F)",
      "Chef de Projet Marketing & Merchandising H/F",
      "Responsable pôle Non Food (H/F) - CHÂTENAY-MALABRY",
      "Chef de secteur H/F",
      "Business Developer B2B - CosmétiquesH/F (H/F)",
      "Assistant Achat (H/F)",
      "Gestionnaire de comptes (F/H)",
      "Référent Prévisionniste des Ventes F/H",
    ];
    for (const titre of pertinents) expect(estOffreHorsCible(titre), titre).toBe(false);
  });

  it("garde les postes B2B proches du profil malgré un vocabulaire voisin", () => {
    expect(estOffreHorsCible("Chargé de clientèle commerciale BtoB (H/F)")).toBe(false);
    expect(estOffreHorsCible("Technico-commercial (f/h) (H/F)")).toBe(false);
    expect(estOffreHorsCible("Commercial Retail (H/F)")).toBe(false);
  });

  it("ignore la casse et les accents", () => {
    expect(estOffreHorsCible("CONSEILLÈRE CLIENTÈLE")).toBe(true);
    expect(estOffreHorsCible("category manager")).toBe(false);
  });
});
