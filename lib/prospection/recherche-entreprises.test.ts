import { describe, expect, it } from "vitest";
import {
  construireUrlRecherche,
  filtrerSiegeDansZone,
  normaliserReponse,
} from "@/lib/prospection/recherche-entreprises";
import { tranchesAPartirDe } from "@/lib/prospection/secteurs";

describe("construireUrlRecherche", () => {
  it("assemble codes NAF, départements et tranches d'effectif", () => {
    const url = new URL(
      construireUrlRecherche({
        secteurId: "boissons",
        departements: ["75", "93"],
        effectifMin: "32",
      }),
    );
    expect(url.searchParams.get("activite_principale")).toContain("11.07A");
    expect(url.searchParams.get("departement")).toBe("75,93");
    expect(url.searchParams.get("tranche_effectif_salarie")).toBe("32,41,42,51,52,53");
    expect(url.searchParams.get("etat_administratif")).toBe("A");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("refuse un secteur inconnu", () => {
    expect(() =>
      construireUrlRecherche({ secteurId: "nimporte", departements: [], effectifMin: "12" }),
    ).toThrow(/inconnu/);
  });

  it("exige un mot-clé pour les sièges de groupes", () => {
    const criteres = { secteurId: "sieges", departements: ["75"], effectifMin: "12" };
    expect(() => construireUrlRecherche(criteres)).toThrow(/mot-clé/);
    const url = new URL(construireUrlRecherche({ ...criteres, motCle: " danone " }));
    expect(url.searchParams.get("q")).toBe("danone");
  });
});

describe("normaliserReponse", () => {
  it("ignore l'effectif non renseigné (NN) et garde le siège pour l'adresse", () => {
    const resultat = normaliserReponse({
      total_results: 1,
      page: 1,
      total_pages: 1,
      results: [
        {
          siren: "552032534",
          nom_complet: "DANONE",
          activite_principale: "70.10Z",
          tranche_effectif_salarie: "NN",
          siege: {
            adresse: "59-61 RUE LA FAYETTE 75009 PARIS",
            code_postal: "75009",
            libelle_commune: "PARIS",
            departement: "75",
          },
        },
      ],
    });
    expect(resultat.entreprises[0]).toMatchObject({
      siren: "552032534",
      nom: "DANONE",
      tranche_effectif: null,
      commune: "PARIS",
      departement: "75",
    });
  });
});

describe("tranchesAPartirDe", () => {
  it("renvoie une liste vide pour un seuil invalide", () => {
    expect(tranchesAPartirDe("ZZ")).toEqual([]);
  });
});

describe("filtrerSiegeDansZone", () => {
  const entreprises = [
    { nom: "Paul", departement: "59" },
    { nom: "Ladurée", departement: "75" },
    { nom: "Cabosse", departement: "92" },
    { nom: "Sans adresse", departement: null },
  ];

  it("écarte les entreprises dont le siège est hors de la zone", () => {
    expect(filtrerSiegeDansZone(entreprises, ["75", "92", "93"]).map((e) => e.nom)).toEqual([
      "Ladurée",
      "Cabosse",
    ]);
  });

  it("ne filtre rien quand aucune zone n'est demandée", () => {
    expect(filtrerSiegeDansZone(entreprises, [])).toHaveLength(4);
  });
});
