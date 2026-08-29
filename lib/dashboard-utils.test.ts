import { describe, expect, it } from "vitest";
import {
  calculerPagesAffichees,
  categorieContrat,
  couleurFortesCorrespondances,
  couleurScoreMoyen,
  detecterAlternanceParTitre,
  detecterStage,
  domaine,
  estAutomatique,
  estParisIntraMuros,
  estStageOuAlternance,
  libelleSource,
  libelleTypeContrat,
  paletteScore,
} from "./dashboard-utils";

describe("paletteScore", () => {
  it("excellent match (85-100) : vert soutenu", () => {
    expect(paletteScore(85)).toEqual({ bg: "#DCEFD8", text: "#1F5C2E" });
    expect(paletteScore(100)).toEqual({ bg: "#DCEFD8", text: "#1F5C2E" });
  });

  it("bon match (70-84) : vert-jaune", () => {
    expect(paletteScore(70)).toEqual({ bg: "#E9F2C9", text: "#5A7A1E" });
    expect(paletteScore(84)).toEqual({ bg: "#E9F2C9", text: "#5A7A1E" });
  });

  it("match correct (50-69) : jaune-ambre", () => {
    expect(paletteScore(50)).toEqual({ bg: "#FBEFD4", text: "#8A5A00" });
    expect(paletteScore(69)).toEqual({ bg: "#FBEFD4", text: "#8A5A00" });
  });

  it("match faible (30-49) : orange", () => {
    expect(paletteScore(30)).toEqual({ bg: "#FBE0CE", text: "#B5551A" });
    expect(paletteScore(49)).toEqual({ bg: "#FBE0CE", text: "#B5551A" });
  });

  it("match très faible (0-29) : rouge", () => {
    expect(paletteScore(0)).toEqual({ bg: "#F9DEDE", text: "#B02323" });
    expect(paletteScore(29)).toEqual({ bg: "#F9DEDE", text: "#B02323" });
  });

  it("ne sort jamais des bornes même hors plage", () => {
    expect(paletteScore(-10)).toEqual(paletteScore(0));
    expect(paletteScore(150)).toEqual(paletteScore(100));
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

describe("calculerPagesAffichees", () => {
  it("affiche simplement 1 s'il n'y a qu'une page", () => {
    expect(calculerPagesAffichees(1, 1)).toEqual([1]);
  });

  it("affiche toutes les pages si elles tiennent dans la fenêtre", () => {
    expect(calculerPagesAffichees(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("insère des ellipses de part et d'autre quand il y a beaucoup de pages", () => {
    expect(calculerPagesAffichees(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });

  it("pas d'ellipse initiale quand la page courante est proche du début", () => {
    expect(calculerPagesAffichees(2, 20)).toEqual([1, 2, 3, "…", 20]);
  });

  it("pas d'ellipse finale quand la page courante est proche de la fin", () => {
    expect(calculerPagesAffichees(19, 20)).toEqual([1, "…", 18, 19, 20]);
  });

  it("première et dernière page toujours présentes", () => {
    const pages = calculerPagesAffichees(10, 20);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(20);
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
