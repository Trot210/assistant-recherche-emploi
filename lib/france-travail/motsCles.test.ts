import { describe, expect, it } from "vitest";
import { selectionnerLotMotsCles, TOUS_MOTS_CLES, TAILLE_LOT_MOTS_CLES } from "./motsCles";

describe("selectionnerLotMotsCles", () => {
  const motsCles = ["a", "b", "c", "d", "e", "f", "g"];

  it("découpe en lots de la taille demandée", () => {
    expect(selectionnerLotMotsCles(motsCles, 3, 0, 1000)).toEqual(["a", "b", "c"]);
  });

  it("passe au lot suivant après un intervalle", () => {
    expect(selectionnerLotMotsCles(motsCles, 3, 1000, 1000)).toEqual(["d", "e", "f"]);
  });

  it("le dernier lot peut être plus court (reste de la division)", () => {
    expect(selectionnerLotMotsCles(motsCles, 3, 2000, 1000)).toEqual(["g"]);
  });

  it("boucle : revient au premier lot une fois tous les lots parcourus", () => {
    expect(selectionnerLotMotsCles(motsCles, 3, 3000, 1000)).toEqual(["a", "b", "c"]);
  });

  it("couvre bien la totalité des mots-clés sur un cycle complet", () => {
    const nbLots = Math.ceil(motsCles.length / 3);
    const vus = new Set<string>();
    for (let i = 0; i < nbLots; i++) {
      selectionnerLotMotsCles(motsCles, 3, i * 1000, 1000).forEach((m) => vus.add(m));
    }
    expect(vus).toEqual(new Set(motsCles));
  });

  it("couvre la liste réelle des mots-clés sur un cycle complet", () => {
    const nbLots = Math.ceil(TOUS_MOTS_CLES.length / TAILLE_LOT_MOTS_CLES);
    const vus = new Set<string>();
    for (let i = 0; i < nbLots; i++) {
      selectionnerLotMotsCles(TOUS_MOTS_CLES, TAILLE_LOT_MOTS_CLES, i * 1000, 1000).forEach((m) =>
        vus.add(m),
      );
    }
    expect(vus).toEqual(new Set(TOUS_MOTS_CLES));
  });
});
