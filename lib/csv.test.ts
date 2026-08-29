import { describe, expect, it } from "vitest";
import { versLigneCsv } from "./csv";

describe("versLigneCsv", () => {
  it("joint les champs avec le séparateur point-virgule par défaut", () => {
    expect(versLigneCsv(["a", "b", "c"])).toBe("a;b;c");
  });

  it("échappe un champ contenant le séparateur", () => {
    expect(versLigneCsv(["Chef de produit; marketing", "Acme"])).toBe(
      '"Chef de produit; marketing";Acme',
    );
  });

  it("échappe et double les guillemets internes", () => {
    expect(versLigneCsv(['Poste "senior"', "Acme"])).toBe('"Poste ""senior""";Acme');
  });

  it("échappe un champ contenant un saut de ligne", () => {
    expect(versLigneCsv(["Ligne 1\nLigne 2"])).toBe('"Ligne 1\nLigne 2"');
  });

  it("convertit null/undefined en champ vide", () => {
    expect(versLigneCsv([null, undefined, "x"])).toBe(";;x");
  });

  it("ne touche pas aux champs simples", () => {
    expect(versLigneCsv(["Category Manager", "Lidl", 42])).toBe("Category Manager;Lidl;42");
  });
});
