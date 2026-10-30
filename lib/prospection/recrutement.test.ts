import { describe, expect, it } from "vitest";
import { employeursQuiRecrutent, estAgenceRecrutement, estContratHorsCible, type OffreRecente } from "@/lib/prospection/recrutement";

const offre = (surcharge: Partial<OffreRecente>): OffreRecente => ({
  titre: "Category Manager H/F",
  entreprise: "Lactalis",
  localisation: "Laval",
  lien_original: "https://exemple.fr/o/1",
  created_at: "2026-10-25T08:00:00Z",
  ...surcharge,
});

describe("estAgenceRecrutement", () => {
  it("repère les cabinets, agences d'intérim et portails", () => {
    expect(estAgenceRecrutement("Michael Page")).toBe(true);
    expect(estAgenceRecrutement("Adecco France")).toBe(true);
    expect(estAgenceRecrutement("Cabinet Dupont Recrutement")).toBe(true);
    expect(estAgenceRecrutement("Lactalis")).toBe(false);
    expect(estAgenceRecrutement("Danone")).toBe(false);
  });

  it("repère les agences connues de ta base, les écoles et les administrations", () => {
    for (const nom of ["Fed Supply", "LTd", "Collective.work", "S&You", "ISCOD", "DIRECTION INTERMINISTERIELLE DU NUMERIQUE", "Ville de Paris", "GROUPE HOSPITALIER FONDATION VALLEE", "ESCP Business School", "CAISSE FEDERALE DE CREDIT MUTUEL"]) {
      expect(estAgenceRecrutement(nom)).toBe(true);
    }
    expect(estAgenceRecrutement("Lidl")).toBe(false);
  });

  it("écarte alternances, stages et freelances", () => {
    expect(estContratHorsCible({ titre: "Alternance Assistant Marketing" })).toBe(true);
    expect(estContratHorsCible({ titre: "Category manager - Freelance (H/F)" })).toBe(true);
    expect(estContratHorsCible({ titre: "Chef de produit", alternance: true })).toBe(true);
    expect(estContratHorsCible({ titre: "Chef de produit", stage: false, alternance: false })).toBe(false);
  });
});

describe("employeursQuiRecrutent", () => {
  it("regroupe par employeur, garde les offres pertinentes et classe par nombre d'offres", () => {
    const offres = [
      offre({ titre: "Category Manager H/F", entreprise: "Lactalis" }),
      offre({ titre: "Acheteur packaging", entreprise: "LACTALIS FRANCE", lien_original: "https://exemple.fr/o/2" }),
      offre({ titre: "Chef de produit", entreprise: "Yoplait", created_at: "2026-10-28T08:00:00Z" }),
      offre({ titre: "Vendeur en magasin", entreprise: "Yoplait" }),
    ];
    const r = employeursQuiRecrutent(offres, []);
    expect(r.map((e) => e.marque)).toEqual(["lactalis", "yoplait"]);
    expect(r[0].offres).toHaveLength(2);
    expect(r[1].offres).toHaveLength(1);
  });

  it("écarte les agences, les entreprises déjà ciblées et les offres sans employeur", () => {
    const offres = [
      offre({ entreprise: "Adecco France" }),
      offre({ entreprise: "Opella" }),
      offre({ entreprise: null }),
      offre({ entreprise: "Lactalis" }),
    ];
    const r = employeursQuiRecrutent(offres, ["OPELLA HEALTHCARE FRANCE SAS"]);
    expect(r.map((e) => e.marque)).toEqual(["lactalis"]);
  });

  it("ne répète pas la même offre et borne le nombre d'employeurs", () => {
    const doublons = [offre({}), offre({}), offre({})];
    expect(employeursQuiRecrutent(doublons, [])[0].offres).toHaveLength(1);
    const beaucoup = Array.from({ length: 30 }, (_, i) => offre({ entreprise: `Société${String.fromCharCode(97 + (i % 26))}x${i}` }));
    expect(employeursQuiRecrutent(beaucoup, [], 10)).toHaveLength(10);
  });
});
