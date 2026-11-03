import { describe, expect, it } from "vitest";
import {
  analyserTermeRecherche,
  construireUrlParNom,
  construireUrlRecherche,
  filtrerSiegeDansZone,
  normaliserReponse,
} from "@/lib/prospection/recherche-entreprises";
import { secteurPourNaf, tranchesAPartirDe } from "@/lib/prospection/secteurs";

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

describe("analyserTermeRecherche", () => {
  it("reconnaît un SIREN, avec ou sans espaces, et un SIRET", () => {
    expect(analyserTermeRecherche("123456789")).toEqual({ type: "siren", siren: "123456789" });
    expect(analyserTermeRecherche(" 123 456 789 ")).toEqual({ type: "siren", siren: "123456789" });
    expect(analyserTermeRecherche("12345678900035")).toEqual({ type: "siren", siren: "123456789" });
  });

  it("garde un nom, nettoyé", () => {
    expect(analyserTermeRecherche("  Société   exemple ")).toEqual({ type: "nom", nom: "Société exemple" });
  });

  it("refuse une saisie vide, trop courte ou un numéro de mauvaise longueur", () => {
    expect(analyserTermeRecherche("")).toHaveProperty("erreur");
    expect(analyserTermeRecherche("ab")).toHaveProperty("erreur");
    expect(analyserTermeRecherche("12345")).toHaveProperty("erreur");
  });
});

describe("construireUrlParNom", () => {
  it("cherche un nom dans toutes les activités, sans les entrepreneurs individuels", () => {
    const url = new URL(construireUrlParNom({ terme: "société exemple" }));
    expect(url.searchParams.get("q")).toBe("société exemple");
    expect(url.searchParams.get("est_entrepreneur_individuel")).toBe("false");
    expect(url.searchParams.has("activite_principale")).toBe(false);
    expect(url.searchParams.has("departement")).toBe(false);
    expect(url.searchParams.has("tranche_effectif_salarie")).toBe(false);
  });

  it("cherche un SIREN tel quel, sans filtre d'individuel", () => {
    const url = new URL(construireUrlParNom({ terme: "123 456 789" }));
    expect(url.searchParams.get("q")).toBe("123456789");
    expect(url.searchParams.has("est_entrepreneur_individuel")).toBe(false);
  });

  it("applique un seuil d'effectif seulement s'il est donné, et la page demandée", () => {
    const url = new URL(construireUrlParNom({ terme: "dupont", effectifMin: "32", page: 2 }));
    expect(url.searchParams.get("tranche_effectif_salarie")).toBe("32,41,42,51,52,53");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("refuse une saisie invalide", () => {
    expect(() => construireUrlParNom({ terme: "ab" })).toThrow(/3 lettres/);
  });
});

describe("secteurPourNaf", () => {
  it("retrouve le secteur d'un code d'activité connu", () => {
    expect(secteurPourNaf("47.11F")?.id).toBe("gms");
    expect(secteurPourNaf("10.51C")?.id).toBe("agroalimentaire");
  });

  it("renvoie null pour un code hors secteurs (centrale d'achat classée autrement) ou absent", () => {
    expect(secteurPourNaf("46.17A")).toBeNull();
    expect(secteurPourNaf("77.40Z")).toBeNull();
    expect(secteurPourNaf(null)).toBeNull();
  });
});
