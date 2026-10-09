import { describe, expect, it } from "vitest";
import { FILTRES_PAR_DEFAUT, lireFiltresSauvegardes, sauvegarderFiltres } from "./filtres-storage";

function faux(initial: Record<string, string> = {}) {
  const donnees = { ...initial };
  return {
    donnees,
    getItem: (c: string) => donnees[c] ?? null,
    setItem: (c: string, v: string) => {
      donnees[c] = v;
    },
  };
}

describe("filtres-storage", () => {
  it("renvoie les défauts sans stockage ou sans valeur enregistrée", () => {
    expect(lireFiltresSauvegardes(null)).toEqual(FILTRES_PAR_DEFAUT);
    expect(lireFiltresSauvegardes(faux())).toEqual(FILTRES_PAR_DEFAUT);
  });

  it("relit ce qui a été sauvegardé", () => {
    const stockage = faux();
    const filtres = { ...FILTRES_PAR_DEFAUT, tri: "date-desc", contrat: "CDI", localisation: "Paris", source: "apec" };
    sauvegarderFiltres(stockage, filtres);
    expect(lireFiltresSauvegardes(stockage)).toEqual(filtres);
  });

  it("ignore champ par champ les valeurs inconnues", () => {
    const stockage = faux({
      "le-rayon:filtres:v1": JSON.stringify({ tri: "n-importe-quoi", contrat: "CDD", notation: 42 }),
    });
    const lu = lireFiltresSauvegardes(stockage);
    expect(lu.tri).toBe(FILTRES_PAR_DEFAUT.tri);
    expect(lu.notation).toBe(FILTRES_PAR_DEFAUT.notation);
    expect(lu.contrat).toBe("CDD");
  });

  it("survit à un JSON corrompu et à un stockage qui lève", () => {
    expect(lireFiltresSauvegardes(faux({ "le-rayon:filtres:v1": "{pas du json" }))).toEqual(FILTRES_PAR_DEFAUT);
    const casse = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(lireFiltresSauvegardes(casse)).toEqual(FILTRES_PAR_DEFAUT);
    expect(() => sauvegarderFiltres(casse, FILTRES_PAR_DEFAUT)).not.toThrow();
  });
});
