import { describe, expect, it } from "vitest";
import {
  enregistrerVisite,
  lireDerniereVisite,
  selectionnerNouvellesPertinentes,
} from "./nouvelles-offres";

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

describe("dernière visite", () => {
  it("null sans stockage ni valeur", () => {
    expect(lireDerniereVisite(null)).toBeNull();
    expect(lireDerniereVisite(faux())).toBeNull();
  });

  it("relit la date enregistrée", () => {
    const stockage = faux();
    enregistrerVisite(stockage, new Date("2026-10-09T12:00:00Z"));
    expect(lireDerniereVisite(stockage)).toBe("2026-10-09T12:00:00.000Z");
  });

  it("ignore une valeur corrompue et un stockage qui lève", () => {
    expect(lireDerniereVisite(faux({ "le-rayon:derniere-visite:v1": "pas une date" }))).toBeNull();
    const casse = {
      getItem: () => {
        throw new Error("bloqué");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(lireDerniereVisite(casse)).toBeNull();
    expect(() => enregistrerVisite(casse, new Date())).not.toThrow();
  });
});

describe("selectionnerNouvellesPertinentes", () => {
  const cibles = ["Category Manager", "Acheteur", "Marketing"];

  it("garde les titres contenant un intitulé ciblé complet, pas un simple mot commun", () => {
    const r = selectionnerNouvellesPertinentes(
      [
        { id: "1", titre: "Category Manager Gaming (H/F)" },
        { id: "2", titre: "Directeur Marketing" },
        { id: "3", titre: "Manager de rayon" },
        { id: "4", titre: "Responsable logistique" },
      ],
      cibles,
    );
    expect(r.map((o) => o.id).sort()).toEqual(["1", "2"]);
  });

  it("vide sans intitulés ciblés", () => {
    expect(selectionnerNouvellesPertinentes([{ id: "1", titre: "Category Manager" }], [])).toEqual([]);
  });
});
