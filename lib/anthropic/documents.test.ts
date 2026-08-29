import { describe, expect, it } from "vitest";
import { tronquer } from "./documents";

describe("tronquer", () => {
  it("laisse le texte intact s'il tient déjà dans la limite", () => {
    expect(tronquer("Texte court.", 100)).toBe("Texte court.");
  });

  it("coupe sur la fin d'une phrase quand elle tombe près de la limite", () => {
    const texte =
      "Category Manager en grande distribution, expert du pilotage de plans multi-catégories. Solide expérience en coordination transverse et en pilotage de la performance via KPI et NielsenIQ. Un complément qui dépasse la limite fixée pour ce test.";
    const resultat = tronquer(texte, 190);
    expect(resultat.endsWith(".")).toBe(true);
    expect(resultat.endsWith("…")).toBe(false);
    expect(resultat.length).toBeLessThanOrEqual(190);
  });

  it("retombe sur une coupure au dernier mot entier avec ellipse si aucune phrase ne tombe assez près", () => {
    const texte = "Un long paragraphe sans aucune ponctuation de fin de phrase qui dépasse largement la limite fixée pour ce test unitaire";
    const resultat = tronquer(texte, 40);
    expect(resultat.endsWith("…")).toBe(true);
    expect(resultat).not.toMatch(/\s…$/);
  });
});
