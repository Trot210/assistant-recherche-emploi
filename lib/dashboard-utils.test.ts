import { describe, expect, it } from "vitest";
import {
  categorieContrat,
  couleurMatch,
  detecterAlternanceParTitre,
  detecterStage,
  domaine,
  estAutomatique,
  estParisIntraMuros,
  estStageOuAlternance,
  libelleSource,
  libelleTypeContrat,
} from "./dashboard-utils";

describe("couleurMatch", () => {
  it("renvoie une couleur neutre pour une offre non notée", () => {
    expect(couleurMatch(null)).toBe("#D9D3C2");
    expect(couleurMatch(undefined)).toBe("#D9D3C2");
  });

  it("renvoie le brick pur à 0 et l'émeraude pur à 100", () => {
    expect(couleurMatch(0)).toBe("#a8412b");
    expect(couleurMatch(100)).toBe("#1f6f5c");
  });

  it("produit des couleurs distinctes pour des scores proches (le but du dégradé)", () => {
    const couleurs = new Set([25, 28, 30, 33, 35].map((s) => couleurMatch(s)));
    expect(couleurs.size).toBe(5);
  });

  it("ne sort jamais des bornes même avec un score hors plage", () => {
    expect(couleurMatch(-10)).toBe(couleurMatch(0));
    expect(couleurMatch(150)).toBe(couleurMatch(100));
  });
});

describe("estAutomatique / libelleSource", () => {
  it("identifie les sources synchronisées automatiquement", () => {
    expect(estAutomatique("france_travail")).toBe(true);
    expect(estAutomatique("apec")).toBe(true);
    expect(estAutomatique("LinkedIn")).toBe(false);
  });

  it("donne un libellé lisible pour les sources connues, sinon la valeur brute", () => {
    expect(libelleSource("france_travail")).toBe("France Travail");
    expect(libelleSource("apec")).toBe("APEC");
    expect(libelleSource("LinkedIn")).toBe("LinkedIn");
  });
});

describe("estParisIntraMuros", () => {
  it("reconnaît Paris et le département 75", () => {
    expect(estParisIntraMuros("Paris 15e")).toBe(true);
    expect(estParisIntraMuros("75 - Paris")).toBe(true);
  });

  it("rejette la banlieue et une localisation absente", () => {
    expect(estParisIntraMuros("92 - Boulogne-Billancourt")).toBe(false);
    expect(estParisIntraMuros(null)).toBe(false);
  });
});

describe("detecterStage / detecterAlternanceParTitre", () => {
  it("détecte un stage dans le titre", () => {
    expect(detecterStage("Stage Category Manager H/F")).toBe(true);
    expect(detecterStage("Chef de Produit H/F")).toBe(false);
  });

  it("détecte l'alternance, y compris en anglais", () => {
    expect(detecterAlternanceParTitre("Alternance Achats")).toBe(true);
    expect(detecterAlternanceParTitre("Apprenticeship Product Manager")).toBe(true);
    expect(detecterAlternanceParTitre("Category Manager H/F")).toBe(false);
  });
});

describe("categorieContrat / libelleTypeContrat / estStageOuAlternance", () => {
  const base = { alternance: false, stage: false, type_contrat: null as string | null };

  it("priorise alternance et stage sur le type de contrat déclaré", () => {
    expect(categorieContrat({ ...base, alternance: true, type_contrat: "CDI" })).toBe(
      "Alternance",
    );
    expect(categorieContrat({ ...base, stage: true, type_contrat: "CDI" })).toBe("Stage");
  });

  it("retombe sur CDI/CDD/Autre selon type_contrat", () => {
    expect(categorieContrat({ ...base, type_contrat: "CDI" })).toBe("CDI");
    expect(categorieContrat({ ...base, type_contrat: "CDD" })).toBe("CDD");
    expect(categorieContrat({ ...base, type_contrat: "Freelance" })).toBe("Autre");
  });

  it("libelleTypeContrat retombe sur le libellé brut pour les contrats \"Autre\"", () => {
    expect(
      libelleTypeContrat({ ...base, type_contrat: "Freelance", type_contrat_libelle: "Freelance" }),
    ).toBe("Freelance");
    expect(libelleTypeContrat({ ...base, type_contrat: "CDI", type_contrat_libelle: null })).toBe(
      "CDI",
    );
  });

  it("estStageOuAlternance est vrai si l'un des deux flags l'est", () => {
    expect(estStageOuAlternance({ ...base, stage: true })).toBe(true);
    expect(estStageOuAlternance({ ...base, alternance: true })).toBe(true);
    expect(estStageOuAlternance(base)).toBe(false);
  });
});

describe("domaine", () => {
  it("extrait le nom de domaine sans le www", () => {
    expect(domaine("https://www.linkedin.com/jobs/view/12345")).toBe("linkedin.com");
    expect(domaine("https://candidat.francetravail.fr/offres/123")).toBe(
      "candidat.francetravail.fr",
    );
  });

  it("renvoie l'entrée telle quelle si ce n'est pas une URL valide", () => {
    expect(domaine("pas-une-url")).toBe("pas-une-url");
  });
});
