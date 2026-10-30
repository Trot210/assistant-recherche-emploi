import { describe, expect, it } from "vitest";
import { coutEstimeUsd, debutMoisParis, formaterUsd, mesurerUsage } from "@/lib/anthropic/tarifs";

describe("mesurerUsage", () => {
  it("lit les compteurs de l'API et met à zéro ceux qui manquent", () => {
    expect(
      mesurerUsage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, server_tool_use: { web_search_requests: 2 } }),
    ).toEqual({ tokensEntree: 10, tokensSortie: 5, tokensCacheLecture: 3, tokensCacheEcriture: 0, recherchesWeb: 2 });
    expect(mesurerUsage(undefined).tokensEntree).toBe(0);
  });
});

describe("coutEstimeUsd", () => {
  it("applique le tarif du modèle aux jetons d'entrée et de sortie", () => {
    const usage = { tokensEntree: 3000, tokensSortie: 500, tokensCacheLecture: 0, tokensCacheEcriture: 0, recherchesWeb: 0 };
    // Sonnet : 2 $ / M en entrée, 10 $ / M en sortie
    expect(coutEstimeUsd("claude-sonnet-5-5", usage)).toBeCloseTo(0.011, 5);
    // Opus 5 : 5 $ / M en entrée, 25 $ / M en sortie
    expect(coutEstimeUsd("claude-opus-5", usage)).toBeCloseTo(0.0275, 5);
  });

  it("compte le cache et les recherches web à part", () => {
    const usage = { tokensEntree: 0, tokensSortie: 0, tokensCacheLecture: 1_000_000, tokensCacheEcriture: 1_000_000, recherchesWeb: 3 };
    // lecture 0,2 $ + écriture 2,5 $ + 3 recherches à 0,01 $
    expect(coutEstimeUsd("claude-sonnet-5-5", usage)).toBeCloseTo(2.73, 5);
  });

  it("ne sous-estime pas un modèle inconnu", () => {
    const usage = { tokensEntree: 1_000_000, tokensSortie: 0, tokensCacheLecture: 0, tokensCacheEcriture: 0, recherchesWeb: 0 };
    expect(coutEstimeUsd("modele-futur", usage)).toBe(5);
  });
});

describe("debutMoisParis", () => {
  it("renvoie le début du mois courant, avec une marge pour le décalage avec l'UTC", () => {
    expect(debutMoisParis(new Date("2026-10-30T12:00:00Z"))).toBe("2026-09-30T22:00:00.000Z");
    // 31 oct. 23 h UTC = 1er nov. 0 h à Paris : on est déjà en novembre
    expect(debutMoisParis(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10-31T22:00:00.000Z");
  });
});

describe("formaterUsd", () => {
  it("garde trois décimales sous 1 $ pour ne pas arrondir les petits montants à zéro", () => {
    expect(formaterUsd(0.0123)).toBe("0,012 $");
    expect(formaterUsd(2.5)).toBe("2,50 $");
  });
});
