import { describe, expect, it } from "vitest";
import { assainirFiche, ficheAPreparer } from "./fiche-entretien";

describe("assainirFiche", () => {
  it("borne et nettoie les listes", () => {
    const f = assainirFiche({
      resume: "  Un   résumé  ",
      infos_pratiques: ["Mardi 24 à 10h", 3, "  "],
      questions_probables: Array.from({ length: 12 }, (_, i) => `Question ${i}`),
      points_forts: ["a"],
      questions_a_poser: [],
      a_verifier: [],
    });
    expect(f?.resume).toBe("Un résumé");
    expect(f?.infos_pratiques).toEqual(["Mardi 24 à 10h"]);
    expect(f?.questions_probables).toHaveLength(6);
  });

  it("refuse une fiche vide ou invalide", () => {
    expect(assainirFiche(null)).toBeNull();
    expect(assainirFiche("texte")).toBeNull();
    expect(assainirFiche({ resume: "", questions_probables: [], points_forts: [] })).toBeNull();
  });
});

describe("ficheAPreparer", () => {
  const maintenant = new Date("2026-11-18T10:00:00Z");
  it("retient les entretiens récents sans fiche, rien d'autre", () => {
    const ids = ficheAPreparer(
      [
        { id: "ok", nature: "entretien", date_mail: "2026-11-16T09:00:00Z", fiche_entretien: null },
        { id: "deja", nature: "entretien", date_mail: "2026-11-16T09:00:00Z", fiche_entretien: { resume: "x" } },
        { id: "vieux", nature: "entretien", date_mail: "2026-10-01T09:00:00Z", fiche_entretien: null },
        { id: "refus", nature: "refus", date_mail: "2026-11-16T09:00:00Z", fiche_entretien: null },
        { id: "sansdate", nature: "entretien", date_mail: null, fiche_entretien: null },
      ],
      maintenant,
    );
    expect(ids).toEqual(["ok"]);
  });
});
