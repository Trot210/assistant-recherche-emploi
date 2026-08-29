import { describe, expect, it } from "vitest";
import {
  categorieContrat,
  couleurFortesCorrespondances,
  couleurMatch,
  couleurScoreMoyen,
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

  it("succès (émeraude) à partir de 70", () => {
    expect(couleurMatch(70)).toBe("#1f6f5c");
    expect(couleurMatch(100)).toBe("#1f6f5c");
  });

  it("avertissement (ambre) entre 50 et 69", () => {
    expect(couleurMatch(50)).toBe("#b8791e");
    expect(couleurMatch(69)).toBe("#b8791e");
  });

  it("neutre (gris) en dessous de 50", () => {
    expect(couleurMatch(0)).toBe("#585f6b");
    expect(couleurMatch(49)).toBe("#585f6b");
  });
});

describe("couleurScoreMoyen / couleurFortesCorrespondances", () => {
  it("alerte (brick) quand la moyenne ou le nombre de fortes correspondances est bas", () => {
    expect(couleurScoreMoyen(0)).toBe("#a8412b");
    expect(couleurFortesCorrespondances(0)).toBe("#a8412b");
  });

  it("succès quand la moyenne ou le nombre de fortes correspondances est haut", () => {
    expect(couleurScoreMoyen(80)).toBe("#1f6f5c");
    expect(couleurFortesCorrespondances(5)).toBe("#1f6f5c");
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
