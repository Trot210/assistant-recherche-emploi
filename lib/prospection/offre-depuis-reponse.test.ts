import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, lienOffreValide, validerOffre } from "./offre-depuis-reponse";

describe("lienOffreValide", () => {
  it("accepte un lien http(s)", () => {
    expect(lienOffreValide("https://exemple.test/offres/42")).toBe("https://exemple.test/offres/42");
    expect(lienOffreValide("  http://exemple.test/a  ")).toBe("http://exemple.test/a");
  });

  it("refuse les autres protocoles, les identifiants intégrés et les valeurs vides ou trop longues", () => {
    expect(lienOffreValide("javascript:alert(1)")).toBeNull();
    expect(lienOffreValide("ftp://exemple.test/a")).toBeNull();
    expect(lienOffreValide("https://user:mdp@exemple.test/a")).toBeNull();
    expect(lienOffreValide("")).toBeNull();
    expect(lienOffreValide(null)).toBeNull();
    expect(lienOffreValide(`https://exemple.test/${"a".repeat(500)}`)).toBeNull();
    expect(lienOffreValide("pas un lien")).toBeNull();
  });
});

describe("validerOffre", () => {
  const base = { titre: "  Category   Manager ", lien: "https://exemple.test/offre/1" };

  it("normalise le titre et garde les champs facultatifs vides à null", () => {
    expect(validerOffre(base)).toEqual({
      offre: { titre: "Category Manager", lien: "https://exemple.test/offre/1", description: null, localisation: null },
    });
  });

  it("garde une description et un lieu", () => {
    const r = validerOffre({ ...base, description: " Texte de l'annonce ", localisation: "Paris" });
    expect(r).toMatchObject({ offre: { description: "Texte de l'annonce", localisation: "Paris" } });
  });

  it("refuse un titre trop court ou absent", () => {
    expect(validerOffre({ ...base, titre: "ab" })).toHaveProperty("erreur");
    expect(validerOffre({ ...base, titre: undefined })).toHaveProperty("erreur");
  });

  it("refuse un lien invalide et une description trop longue", () => {
    expect(validerOffre({ ...base, lien: "x" })).toHaveProperty("erreur");
    expect(validerOffre({ ...base, description: "a".repeat(DESCRIPTION_MAX + 1) })).toHaveProperty("erreur");
  });
});
