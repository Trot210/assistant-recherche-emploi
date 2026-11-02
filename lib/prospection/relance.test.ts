import { describe, expect, it } from "vitest";
import { consigneRelance, messagesPrecedents } from "./relance";

describe("consigneRelance", () => {
  it("la première relance est un rappel court avec au plus un élément nouveau", () => {
    const c = consigneRelance(1, 380);
    expect(c).toMatch(/relance n°1/);
    expect(c).toMatch(/UN élément nouveau/);
    expect(c).toMatch(/380/);
  });

  it("la dernière relance change d'angle et laisse une sortie", () => {
    const c = consigneRelance(2, 380);
    expect(c).toMatch(/DERNIÈRE/);
    expect(c).toMatch(/changer d'angle/);
    expect(c).toMatch(/quinze minutes/);
    expect(c).toMatch(/un mot suffit/);
  });

  it("interdit les formules de relance qui reprochent le silence", () => {
    for (const n of [1, 2]) expect(consigneRelance(n, 380)).toMatch(/je me permets de relancer/);
  });
});

describe("messagesPrecedents", () => {
  it("liste le message initial puis chaque relance, dans l'ordre", () => {
    const texte = messagesPrecedents({ date: "2026-11-02", corps: "Premier." }, [{ date: "2026-11-10", corps: "Rappel." }]);
    expect(texte.indexOf("Message initial")).toBeLessThan(texte.indexOf("Relance n°1"));
    expect(texte).toContain("envoyé le 2026-11-10");
    expect(texte).toContain("Rappel.");
  });
});
